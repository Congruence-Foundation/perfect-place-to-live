/**
 * Bulk import POIs to Neon PostgreSQL using fast COPY-like operations
 * 
 * This script:
 * 1. Creates a staging table
 * 2. Bulk inserts POIs using batched INSERT statements (Neon doesn't support COPY)
 * 3. Provides progress tracking and error handling
 * 
 * Usage: npx tsx scripts/bulk-import.ts [--input <path>] [--batch-size <n>]
 */

import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as readline from 'readline';
import * as dotenv from 'dotenv';
import { ExtractedPOI } from './extract-pois';

// Load environment variables
dotenv.config({ path: '.env.local' });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in environment');
  process.exit(1);
}

// Batch size for bulk inserts (Neon has query size limits)
const DEFAULT_BATCH_SIZE = 1000;

/**
 * Create staging table for bulk import
 */
export async function createStagingTable(sql: NeonQueryFunction<false, false>): Promise<void> {
  console.log('Creating staging table...');
  
  await sql`
    DROP TABLE IF EXISTS osm_pois_staging;
  `;
  
  await sql`
    CREATE TABLE osm_pois_staging (
      id BIGINT PRIMARY KEY,
      factor_id VARCHAR(50) NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      name VARCHAR(255),
      tags JSONB
    );
  `;
  
  console.log('✓ Staging table created');
}

/**
 * Bulk insert POIs into staging table
 */
export async function bulkInsertToStaging(
  sql: NeonQueryFunction<false, false>,
  pois: ExtractedPOI[]
): Promise<number> {
  if (pois.length === 0) return 0;

  // Build VALUES clause for bulk insert
  const values = pois.map(poi => {
    const tagsJson = JSON.stringify(poi.tags).replace(/'/g, "''");
    const name = poi.name ? poi.name.replace(/'/g, "''").substring(0, 255) : null;
    return `(${poi.id}, '${poi.factor_id}', ${poi.lat}, ${poi.lng}, ${name ? `'${name}'` : 'NULL'}, '${tagsJson}'::jsonb)`;
  }).join(',\n');

  const query = `
    INSERT INTO osm_pois_staging (id, factor_id, lat, lng, name, tags)
    VALUES ${values}
    ON CONFLICT (id) DO UPDATE SET
      factor_id = EXCLUDED.factor_id,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      name = EXCLUDED.name,
      tags = EXCLUDED.tags
  `;

  try {
    // Use sql.query() for raw SQL execution instead of sql.unsafe()
    await sql.query(query, []);
    return pois.length;
  } catch (error) {
    // If batch fails, try inserting one by one to identify problematic records
    console.warn(`Batch insert failed, falling back to individual inserts...`);
    console.warn(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    let inserted = 0;
    for (const poi of pois) {
      try {
        await sql`
          INSERT INTO osm_pois_staging (id, factor_id, lat, lng, name, tags)
          VALUES (${poi.id}, ${poi.factor_id}, ${poi.lat}, ${poi.lng}, ${poi.name}, ${JSON.stringify(poi.tags)})
          ON CONFLICT (id) DO UPDATE SET
            factor_id = EXCLUDED.factor_id,
            lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            name = EXCLUDED.name,
            tags = EXCLUDED.tags
        `;
        inserted++;
      } catch (e) {
        console.warn(`  Skipping POI ${poi.id}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }
    return inserted;
  }
}

/**
 * Stream POIs from NDJSON file and bulk insert to staging
 */
export async function importFromNdjson(
  sql: NeonQueryFunction<false, false>,
  inputPath: string,
  batchSize: number = DEFAULT_BATCH_SIZE
): Promise<{ total: number; inserted: number; errors: number }> {
  const stats = { total: 0, inserted: 0, errors: 0 };
  
  const fileStream = fs.createReadStream(inputPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let batch: ExtractedPOI[] = [];
  const startTime = Date.now();

  for await (const line of rl) {
    if (!line.trim()) continue;
    
    try {
      const poi: ExtractedPOI = JSON.parse(line);
      batch.push(poi);
      stats.total++;

      // Insert batch when full
      if (batch.length >= batchSize) {
        const inserted = await bulkInsertToStaging(sql, batch);
        stats.inserted += inserted;
        stats.errors += batch.length - inserted;
        batch = [];

        // Progress update
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = Math.round(stats.total / elapsed);
        process.stdout.write(`\r  Imported ${stats.inserted.toLocaleString()} POIs (${rate}/s)...`);
      }
    } catch (e) {
      stats.errors++;
    }
  }

  // Insert remaining batch
  if (batch.length > 0) {
    const inserted = await bulkInsertToStaging(sql, batch);
    stats.inserted += inserted;
    stats.errors += batch.length - inserted;
  }

  console.log(''); // New line after progress
  return stats;
}

/**
 * Create indexes on staging table for faster sync
 */
export async function createStagingIndexes(sql: NeonQueryFunction<false, false>): Promise<void> {
  console.log('Creating staging table indexes...');
  
  await sql`
    CREATE INDEX IF NOT EXISTS idx_staging_factor ON osm_pois_staging (factor_id);
  `;
  
  console.log('✓ Indexes created');
}

/**
 * Get staging table statistics
 */
export async function getStagingStats(sql: NeonQueryFunction<false, false>): Promise<{
  total: number;
  byFactor: Record<string, number>;
}> {
  const countResult = await sql`SELECT COUNT(*) as count FROM osm_pois_staging`;
  const total = parseInt(countResult[0].count as string);

  const factorCounts = await sql`
    SELECT factor_id, COUNT(*) as count 
    FROM osm_pois_staging 
    GROUP BY factor_id 
    ORDER BY count DESC
  `;

  const byFactor: Record<string, number> = {};
  for (const row of factorCounts) {
    byFactor[row.factor_id as string] = parseInt(row.count as string);
  }

  return { total, byFactor };
}

/**
 * Main bulk import function
 */
export async function bulkImport(options: {
  inputPath?: string;
  batchSize?: number;
}): Promise<{ total: number; inserted: number; errors: number }> {
  const inputPath = options.inputPath || './data/pois-extracted.ndjson';
  const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;

  // Check input file exists
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    console.error('Run extract-pois.ts first to extract POIs from PBF.');
    process.exit(1);
  }

  const sql = neon(DATABASE_URL!);

  console.log('=== Bulk POI Import ===');
  console.log(`Input: ${inputPath}`);
  console.log(`Batch size: ${batchSize}`);
  console.log('');

  // Create staging table
  await createStagingTable(sql);

  // Import POIs
  console.log('Importing POIs to staging table...');
  const startTime = Date.now();
  const stats = await importFromNdjson(sql, inputPath, batchSize);
  const elapsed = (Date.now() - startTime) / 1000;

  console.log(`\n✓ Import completed in ${elapsed.toFixed(1)}s`);
  console.log(`  Total processed: ${stats.total.toLocaleString()}`);
  console.log(`  Successfully imported: ${stats.inserted.toLocaleString()}`);
  if (stats.errors > 0) {
    console.log(`  Errors: ${stats.errors.toLocaleString()}`);
  }

  // Create indexes
  await createStagingIndexes(sql);

  // Show statistics
  console.log('\nStaging table statistics:');
  const stagingStats = await getStagingStats(sql);
  console.log(`  Total POIs: ${stagingStats.total.toLocaleString()}`);
  console.log('\n  By category:');
  for (const [factor, count] of Object.entries(stagingStats.byFactor)) {
    console.log(`    ${factor}: ${count.toLocaleString()}`);
  }

  return stats;
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: { inputPath?: string; batchSize?: number } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      options.inputPath = args[++i];
    } else if (args[i] === '--batch-size' && args[i + 1]) {
      options.batchSize = parseInt(args[++i]);
    }
  }

  bulkImport(options).catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
  });
}
