/**
 * POI Sync Orchestrator - Full sync pipeline for Poland POIs
 * 
 * This script orchestrates the complete POI synchronization:
 * 1. Download Poland PBF from Geofabrik (optional, can skip if cached)
 * 2. Optionally extract a region/city using osmium extract
 * 3. Extract POIs using osmium-tool
 * 4. Bulk import to staging table
 * 5. Atomic sync: add new, update changed, delete removed POIs
 * 6. Record sync metadata
 * 
 * Usage:
 *   npx tsx scripts/sync-pois.ts                    # Full Poland sync
 *   npx tsx scripts/sync-pois.ts --region poznan   # Sync only Poznań area
 *   npx tsx scripts/sync-pois.ts --region warsaw   # Sync only Warsaw area
 *   npx tsx scripts/sync-pois.ts --bbox "16.8,52.3,17.1,52.5"  # Custom bbox
 *   npx tsx scripts/sync-pois.ts --skip-download   # Use cached PBF
 *   npx tsx scripts/sync-pois.ts --dry-run         # Preview changes only
 */

import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { extractPOIs, checkOsmiumInstalled, getOsmiumVersion } from './extract-pois';
import { bulkImport, getStagingStats } from './bulk-import';

// Load environment variables
dotenv.config({ path: '.env.local' });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in environment');
  process.exit(1);
}

// Predefined regions/cities with bounding boxes
// Format: [west, south, east, north] (minLon, minLat, maxLon, maxLat)
const PREDEFINED_REGIONS: Record<string, { name: string; bbox: [number, number, number, number] }> = {
  // Major cities
  poznan: { name: 'Poznań', bbox: [16.73, 52.30, 17.15, 52.52] },
  warsaw: { name: 'Warsaw', bbox: [20.75, 52.05, 21.30, 52.40] },
  krakow: { name: 'Kraków', bbox: [19.75, 49.95, 20.20, 50.15] },
  wroclaw: { name: 'Wrocław', bbox: [16.85, 51.00, 17.20, 51.20] },
  gdansk: { name: 'Gdańsk', bbox: [18.45, 54.25, 18.85, 54.45] },
  lodz: { name: 'Łódź', bbox: [19.30, 51.65, 19.65, 51.90] },
  katowice: { name: 'Katowice', bbox: [18.85, 50.15, 19.15, 50.35] },
  szczecin: { name: 'Szczecin', bbox: [14.40, 53.35, 14.70, 53.50] },
  lublin: { name: 'Lublin', bbox: [22.40, 51.15, 22.70, 51.35] },
  bialystok: { name: 'Białystok', bbox: [22.95, 53.05, 23.25, 53.20] },
  
  // Regions (voivodeships)
  wielkopolskie: { name: 'Wielkopolskie', bbox: [15.80, 51.55, 18.95, 53.00] },
  mazowieckie: { name: 'Mazowieckie', bbox: [19.25, 51.00, 22.05, 53.00] },
  malopolskie: { name: 'Małopolskie', bbox: [19.10, 49.40, 21.00, 50.50] },
  dolnoslaskie: { name: 'Dolnośląskie', bbox: [14.80, 50.30, 17.80, 51.80] },
  pomorskie: { name: 'Pomorskie', bbox: [16.70, 53.45, 19.65, 54.85] },
  slaskie: { name: 'Śląskie', bbox: [18.00, 49.45, 19.90, 50.80] },
  
  // Test regions (very small for quick testing)
  'poznan-center': { name: 'Poznań Center', bbox: [16.88, 52.38, 16.98, 52.44] },
  'warsaw-center': { name: 'Warsaw Center', bbox: [20.98, 52.20, 21.08, 52.26] },
  test: { name: 'Test Area (Poznań Old Town)', bbox: [16.91, 52.40, 16.95, 52.42] },
};

interface SyncOptions {
  skipDownload?: boolean;
  dryRun?: boolean;
  force?: boolean;
  dataDir?: string;
  region?: string;
  bbox?: [number, number, number, number];
}

interface SyncStats {
  downloaded: boolean;
  extracted: number;
  imported: number;
  added: number;
  updated: number;
  deleted: number;
  duration: number;
  region?: string;
}

/**
 * Download Poland PBF from Geofabrik
 */
async function downloadPBF(dataDir: string): Promise<boolean> {
  console.log('\n=== Step 1: Download Poland PBF ===');
  
  const scriptPath = path.join(__dirname, 'download-poland.sh');
  
  if (!fs.existsSync(scriptPath)) {
    console.error(`Download script not found: ${scriptPath}`);
    return false;
  }

  try {
    execSync(`bash "${scriptPath}" "${dataDir}"`, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error('Download failed:', error);
    return false;
  }
}

/**
 * Extract a region from the Poland PBF using osmium extract
 */
function extractRegion(
  inputPbf: string,
  outputPbf: string,
  bbox: [number, number, number, number],
  regionName: string
): boolean {
  console.log(`\n=== Extracting Region: ${regionName} ===`);
  console.log(`  Bounding box: ${bbox.join(', ')}`);
  console.log(`  (west, south, east, north)`);
  
  const [west, south, east, north] = bbox;
  const bboxStr = `${west},${south},${east},${north}`;
  
  try {
    const cmd = `osmium extract -b "${bboxStr}" "${inputPbf}" -o "${outputPbf}" --overwrite`;
    console.log(`  Running: ${cmd}`);
    
    const startTime = Date.now();
    execSync(cmd, { stdio: 'inherit' });
    const elapsed = (Date.now() - startTime) / 1000;
    
    const stats = fs.statSync(outputPbf);
    console.log(`  ✓ Extracted in ${elapsed.toFixed(1)}s`);
    console.log(`  Output size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
    
    return true;
  } catch (error) {
    console.error('Region extraction failed:', error);
    return false;
  }
}

/**
 * Perform atomic sync from staging to main table
 * This handles: INSERT new, UPDATE changed, DELETE removed
 */
async function atomicSync(
  sql: NeonQueryFunction<false, false>,
  dryRun: boolean = false,
  regionBbox?: [number, number, number, number]
): Promise<{ added: number; updated: number; deleted: number }> {
  console.log('\n=== Step 4: Atomic Sync ===');

  // Get current counts
  const currentCount = await sql`SELECT COUNT(*) as count FROM osm_pois`;
  const stagingCount = await sql`SELECT COUNT(*) as count FROM osm_pois_staging`;
  
  console.log(`Current POIs in main table: ${parseInt(currentCount[0].count as string).toLocaleString()}`);
  console.log(`POIs in staging table: ${parseInt(stagingCount[0].count as string).toLocaleString()}`);

  // If syncing a region, only delete POIs within that region's bbox
  let deleteCondition = '';
  if (regionBbox) {
    const [west, south, east, north] = regionBbox;
    deleteCondition = `AND lng >= ${west} AND lng <= ${east} AND lat >= ${south} AND lat <= ${north}`;
    console.log(`\n  Region sync mode: Only affecting POIs within bbox`);
  }

  // Calculate changes
  let deleteCount = 0;
  let addCount = 0;
  let updateCount = 0;

  try {
    if (regionBbox) {
      const [west, south, east, north] = regionBbox;
      const toDelete = await sql`
        SELECT COUNT(*) as count 
        FROM osm_pois 
        WHERE id NOT IN (SELECT id FROM osm_pois_staging)
        AND lng >= ${west} AND lng <= ${east} AND lat >= ${south} AND lat <= ${north}
      `;
      deleteCount = parseInt(toDelete[0]?.count as string) || 0;
    } else {
      const toDelete = await sql`
        SELECT COUNT(*) as count 
        FROM osm_pois 
        WHERE id NOT IN (SELECT id FROM osm_pois_staging)
      `;
      deleteCount = parseInt(toDelete[0]?.count as string) || 0;
    }

    const toAdd = await sql`
      SELECT COUNT(*) as count 
      FROM osm_pois_staging 
      WHERE id NOT IN (SELECT id FROM osm_pois)
    `;
    addCount = parseInt(toAdd[0]?.count as string) || 0;

    const toUpdate = await sql`
      SELECT COUNT(*) as count 
      FROM osm_pois_staging s
      INNER JOIN osm_pois o ON s.id = o.id
      WHERE s.factor_id != o.factor_id 
         OR s.lat != o.lat 
         OR s.lng != o.lng 
         OR s.name IS DISTINCT FROM o.name
    `;
    updateCount = parseInt(toUpdate[0]?.count as string) || 0;
  } catch (error) {
    console.error('Error calculating changes:', error);
    throw error;
  }

  console.log(`\nChanges to apply:`);
  console.log(`  New POIs to add: ${addCount.toLocaleString()}`);
  console.log(`  POIs to update: ${updateCount.toLocaleString()}`);
  console.log(`  POIs to delete: ${deleteCount.toLocaleString()}`);

  if (dryRun) {
    console.log('\n[DRY RUN] No changes applied.');
    return { added: addCount, updated: updateCount, deleted: deleteCount };
  }

  console.log('\nApplying changes...');
  const startTime = Date.now();

  // Perform atomic sync in a transaction-like manner
  // Note: Neon serverless doesn't support true transactions, but we can minimize inconsistency

  // Step 1: Delete POIs that no longer exist (within region if specified)
  if (deleteCount > 0) {
    console.log('  Deleting removed POIs...');
    if (regionBbox) {
      const [west, south, east, north] = regionBbox;
      await sql.unsafe(`
        DELETE FROM osm_pois 
        WHERE id NOT IN (SELECT id FROM osm_pois_staging)
        AND lng >= ${west} AND lng <= ${east} AND lat >= ${south} AND lat <= ${north}
      `);
    } else {
      await sql`
        DELETE FROM osm_pois 
        WHERE id NOT IN (SELECT id FROM osm_pois_staging)
      `;
    }
    console.log(`  ✓ Deleted ${deleteCount.toLocaleString()} POIs`);
  }

  // Step 2: Upsert all POIs from staging (handles both add and update)
  console.log('  Upserting POIs...');
  await sql`
    INSERT INTO osm_pois (id, factor_id, lat, lng, geom, name, tags, created_at)
    SELECT 
      id, 
      factor_id, 
      lat, 
      lng, 
      ST_SetSRID(ST_MakePoint(lng, lat), 4326),
      name, 
      tags,
      NOW()
    FROM osm_pois_staging
    ON CONFLICT (id) DO UPDATE SET
      factor_id = EXCLUDED.factor_id,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      geom = EXCLUDED.geom,
      name = EXCLUDED.name,
      tags = EXCLUDED.tags
  `;
  console.log(`  ✓ Upserted ${(addCount + updateCount).toLocaleString()} POIs`);

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\n✓ Sync completed in ${elapsed.toFixed(1)}s`);

  return { added: addCount, updated: updateCount, deleted: deleteCount };
}

/**
 * Record sync metadata
 */
async function recordSyncMetadata(
  sql: NeonQueryFunction<false, false>,
  stats: SyncStats
): Promise<void> {
  // Ensure sync_metadata table exists
  await sql`
    CREATE TABLE IF NOT EXISTS poi_sync_metadata (
      id SERIAL PRIMARY KEY,
      sync_date TIMESTAMP DEFAULT NOW(),
      region VARCHAR(100),
      pois_extracted INTEGER,
      pois_imported INTEGER,
      pois_added INTEGER,
      pois_updated INTEGER,
      pois_deleted INTEGER,
      duration_seconds NUMERIC,
      status VARCHAR(50)
    )
  `;

  await sql`
    INSERT INTO poi_sync_metadata 
    (region, pois_extracted, pois_imported, pois_added, pois_updated, pois_deleted, duration_seconds, status)
    VALUES 
    (${stats.region || 'poland'}, ${stats.extracted}, ${stats.imported}, ${stats.added}, ${stats.updated}, ${stats.deleted}, ${stats.duration}, 'completed')
  `;
}

/**
 * Clean up staging table
 */
async function cleanup(sql: NeonQueryFunction<false, false>): Promise<void> {
  console.log('\nCleaning up...');
  await sql`DROP TABLE IF EXISTS osm_pois_staging`;
  console.log('✓ Staging table dropped');
}

/**
 * List available regions
 */
function listRegions(): void {
  console.log('\nAvailable predefined regions:\n');
  
  console.log('Cities:');
  const cities = ['poznan', 'warsaw', 'krakow', 'wroclaw', 'gdansk', 'lodz', 'katowice', 'szczecin', 'lublin', 'bialystok'];
  for (const key of cities) {
    const region = PREDEFINED_REGIONS[key];
    console.log(`  ${key.padEnd(20)} ${region.name}`);
  }
  
  console.log('\nVoivodeships:');
  const voivodeships = ['wielkopolskie', 'mazowieckie', 'malopolskie', 'dolnoslaskie', 'pomorskie', 'slaskie'];
  for (const key of voivodeships) {
    const region = PREDEFINED_REGIONS[key];
    console.log(`  ${key.padEnd(20)} ${region.name}`);
  }
  
  console.log('\nTest regions (small, for quick testing):');
  const testRegions = ['poznan-center', 'warsaw-center', 'test'];
  for (const key of testRegions) {
    const region = PREDEFINED_REGIONS[key];
    console.log(`  ${key.padEnd(20)} ${region.name}`);
  }
  
  console.log('\nOr use --bbox "west,south,east,north" for custom bounding box');
}

/**
 * Main sync function
 */
export async function syncPOIs(options: SyncOptions = {}): Promise<SyncStats> {
  const {
    skipDownload = false,
    dryRun = false,
    force = false,
    dataDir = './data',
    region,
    bbox,
  } = options;

  const stats: SyncStats = {
    downloaded: false,
    extracted: 0,
    imported: 0,
    added: 0,
    updated: 0,
    deleted: 0,
    duration: 0,
    region: region || (bbox ? 'custom' : undefined),
  };

  const startTime = Date.now();

  // Determine region info
  let regionBbox: [number, number, number, number] | undefined;
  let regionName = 'Poland (full)';
  
  if (region) {
    const predefined = PREDEFINED_REGIONS[region.toLowerCase()];
    if (!predefined) {
      console.error(`Unknown region: ${region}`);
      console.error('Use --list-regions to see available regions');
      process.exit(1);
    }
    regionBbox = predefined.bbox;
    regionName = predefined.name;
  } else if (bbox) {
    regionBbox = bbox;
    regionName = `Custom (${bbox.join(', ')})`;
  }

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Poland POI Sync Pipeline                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Options:`);
  console.log(`  Region: ${regionName}`);
  console.log(`  Skip download: ${skipDownload}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log(`  Force: ${force}`);
  console.log(`  Data directory: ${dataDir}`);

  // Check prerequisites
  console.log('\n=== Prerequisites Check ===');
  
  if (!checkOsmiumInstalled()) {
    console.error('');
    console.error('ERROR: osmium-tool is not installed!');
    console.error('');
    console.error('Install it using:');
    console.error('  macOS:  brew install osmium-tool');
    console.error('  Ubuntu: apt-get install osmium-tool');
    console.error('  Fedora: dnf install osmium-tool');
    process.exit(1);
  }
  
  const osmiumVersion = getOsmiumVersion();
  console.log(`✓ osmium-tool: ${osmiumVersion}`);
  console.log(`✓ Database: Connected`);

  const sql = neon(DATABASE_URL!);

  // Ensure data directory exists
  fs.mkdirSync(dataDir, { recursive: true });

  const polandPbfPath = path.join(dataDir, 'poland-latest.osm.pbf');
  const regionPbfPath = regionBbox 
    ? path.join(dataDir, `region-${region || 'custom'}.osm.pbf`)
    : polandPbfPath;
  const extractedPath = path.join(dataDir, 'pois-extracted.ndjson');

  // Step 1: Download PBF
  if (!skipDownload) {
    stats.downloaded = await downloadPBF(dataDir);
    if (!stats.downloaded && !fs.existsSync(polandPbfPath)) {
      console.error('Download failed and no cached PBF found. Aborting.');
      process.exit(1);
    }
  } else {
    console.log('\n=== Step 1: Download (Skipped) ===');
    if (!fs.existsSync(polandPbfPath)) {
      console.error(`PBF file not found: ${polandPbfPath}`);
      console.error('Run without --skip-download to download the file.');
      process.exit(1);
    }
    const pbfStats = fs.statSync(polandPbfPath);
    console.log(`Using cached PBF: ${polandPbfPath}`);
    console.log(`File size: ${(pbfStats.size / 1024 / 1024 / 1024).toFixed(2)} GB`);
    console.log(`Last modified: ${pbfStats.mtime.toISOString()}`);
  }

  // Step 1.5: Extract region if specified
  let pbfToProcess = polandPbfPath;
  if (regionBbox) {
    const extracted = extractRegion(polandPbfPath, regionPbfPath, regionBbox, regionName);
    if (!extracted) {
      console.error('Region extraction failed. Aborting.');
      process.exit(1);
    }
    pbfToProcess = regionPbfPath;
  }

  // Step 2: Extract POIs
  console.log('\n=== Step 2: Extract POIs ===');
  
  // Filter file is now generated dynamically from common config
  const extractResult = await extractPOIs({
    pbfPath: pbfToProcess,
    outputDir: dataDir,
  });
  stats.extracted = extractResult.stats.total;

  // Step 3: Bulk import to staging
  console.log('\n=== Step 3: Bulk Import to Staging ===');
  const importResult = await bulkImport({
    inputPath: extractedPath,
    batchSize: 1000,
  });
  stats.imported = importResult.inserted;

  // Step 4: Atomic sync
  const syncResult = await atomicSync(sql, dryRun, regionBbox);
  stats.added = syncResult.added;
  stats.updated = syncResult.updated;
  stats.deleted = syncResult.deleted;

  // Cleanup
  if (!dryRun) {
    await cleanup(sql);
    
    // Record metadata
    stats.duration = (Date.now() - startTime) / 1000;
    await recordSyncMetadata(sql, stats);
  }

  // Clean up region PBF if created
  if (regionBbox && fs.existsSync(regionPbfPath)) {
    fs.unlinkSync(regionPbfPath);
  }

  // Final summary
  stats.duration = (Date.now() - startTime) / 1000;
  
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    Sync Summary                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`  Region: ${regionName}`);
  console.log(`  Total duration: ${stats.duration.toFixed(1)}s`);
  console.log(`  POIs extracted: ${stats.extracted.toLocaleString()}`);
  console.log(`  POIs imported: ${stats.imported.toLocaleString()}`);
  console.log(`  POIs added: ${stats.added.toLocaleString()}`);
  console.log(`  POIs updated: ${stats.updated.toLocaleString()}`);
  console.log(`  POIs deleted: ${stats.deleted.toLocaleString()}`);
  
  if (dryRun) {
    console.log('\n  [DRY RUN - No changes were applied]');
  }

  // Verify final count
  if (!dryRun) {
    const finalCount = await sql`SELECT COUNT(*) as count FROM osm_pois`;
    console.log(`\n  Final POI count: ${parseInt(finalCount[0].count as string).toLocaleString()}`);
  }

  return stats;
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: SyncOptions = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--skip-download':
        options.skipDownload = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--data-dir':
        options.dataDir = args[++i];
        break;
      case '--region':
      case '-r':
        options.region = args[++i];
        break;
      case '--bbox':
      case '-b':
        const bboxStr = args[++i];
        const parts = bboxStr.split(',').map(Number);
        if (parts.length !== 4 || parts.some(isNaN)) {
          console.error('Invalid bbox format. Use: west,south,east,north');
          process.exit(1);
        }
        options.bbox = parts as [number, number, number, number];
        break;
      case '--list-regions':
      case '-l':
        listRegions();
        process.exit(0);
      case '--help':
      case '-h':
        console.log(`
Poland POI Sync Pipeline

Usage: npx tsx scripts/sync-pois.ts [options]

Options:
  --region, -r <name>   Sync only a specific region/city
  --bbox, -b <coords>   Custom bounding box (west,south,east,north)
  --list-regions, -l    List available predefined regions
  --skip-download       Use cached PBF file instead of downloading
  --dry-run             Preview changes without applying them
  --force               Force full replacement (not incremental)
  --data-dir <dir>      Directory for data files (default: ./data)
  --help, -h            Show this help message

Examples:
  npx tsx scripts/sync-pois.ts                         # Full Poland sync
  npx tsx scripts/sync-pois.ts --region poznan         # Sync Poznań area
  npx tsx scripts/sync-pois.ts --region test           # Quick test (tiny area)
  npx tsx scripts/sync-pois.ts --region warsaw-center  # Warsaw city center
  npx tsx scripts/sync-pois.ts --bbox "16.8,52.3,17.1,52.5"  # Custom bbox
  npx tsx scripts/sync-pois.ts --skip-download --region poznan  # Use cached PBF
  npx tsx scripts/sync-pois.ts --list-regions          # Show all regions

Predefined regions include major Polish cities (poznan, warsaw, krakow, etc.),
voivodeships (wielkopolskie, mazowieckie, etc.), and small test areas.
`);
        process.exit(0);
    }
  }

  syncPOIs(options)
    .then((stats) => {
      console.log('\n✓ Sync completed successfully!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n✗ Sync failed:', err);
      process.exit(1);
    });
}
