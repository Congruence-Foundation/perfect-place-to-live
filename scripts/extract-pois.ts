/**
 * Extract POIs from Poland PBF using osmium-tool
 * 
 * This script:
 * 1. Checks for osmium-tool installation
 * 2. Filters POIs by tags defined in the common config
 * 3. Exports to GeoJSON with coordinates
 * 4. Parses and categorizes POIs by factor_id
 * 
 * Usage: npx tsx scripts/extract-pois.ts [--pbf-path <path>] [--output <path>]
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { POI_CATEGORIES, buildTagMapping, generateOsmiumFilters } from '../src/config/poi-categories';

// Build tag mapping from common config
const FACTOR_TAG_MAPPING = buildTagMapping();

export interface ExtractedPOI {
  id: number;
  factor_id: string;
  lat: number;
  lng: number;
  name: string | null;
  tags: Record<string, string>;
}

/**
 * Check if osmium-tool is installed
 */
export function checkOsmiumInstalled(): boolean {
  try {
    execSync('which osmium', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get osmium version
 */
export function getOsmiumVersion(): string | null {
  try {
    const output = execSync('osmium --version', { encoding: 'utf-8' });
    const match = output.match(/osmium version (\d+\.\d+\.\d+)/);
    return match ? match[1] : output.trim().split('\n')[0];
  } catch {
    return null;
  }
}

/**
 * Determine factor_id from OSM tags
 * Returns the first matching factor_id
 */
export function getFactorIdFromTags(tags: Record<string, string>): string | null {
  for (const [factorId, tagPatterns] of Object.entries(FACTOR_TAG_MAPPING)) {
    for (const pattern of tagPatterns) {
      const [key, value] = pattern.split('=');
      if (tags[key] === value) {
        return factorId;
      }
    }
  }
  return null;
}

/**
 * Determine ALL matching factor_ids from OSM tags
 * A single POI can match multiple factors (e.g., place=city matches both city_center and city_downtown)
 */
export function getAllFactorIdsFromTags(tags: Record<string, string>): string[] {
  const matchingFactors: string[] = [];
  
  for (const [factorId, tagPatterns] of Object.entries(FACTOR_TAG_MAPPING)) {
    for (const pattern of tagPatterns) {
      const [key, value] = pattern.split('=');
      if (tags[key] === value) {
        matchingFactors.push(factorId);
        break; // Found a match for this factor, move to next factor
      }
    }
  }
  
  return matchingFactors;
}

/**
 * Extract POIs from PBF file using osmium
 * Returns path to the output NDJSON file
 */
export async function extractPOIsWithOsmium(
  pbfPath: string,
  outputDir: string,
  filterFile: string
): Promise<string> {
  const filteredPbf = path.join(outputDir, 'poland-filtered.osm.pbf');
  const outputNdjson = path.join(outputDir, 'pois.ndjson');

  console.log('Step 1: Filtering POIs from PBF...');
  console.log(`  Input: ${pbfPath}`);
  console.log(`  Filter: ${filterFile}`);
  
  // Step 1: Filter POIs using osmium tags-filter
  // Note: We do NOT use -R (--omit-referenced) because we need the referenced nodes
  // to be able to convert ways/areas to geometries in the export step
  const filterCmd = `osmium tags-filter "${pbfPath}" -e "${filterFile}" -o "${filteredPbf}" --overwrite`;
  console.log(`  Running: ${filterCmd}`);
  
  const startFilter = Date.now();
  execSync(filterCmd, { stdio: 'inherit' });
  console.log(`  ✓ Filtering completed in ${((Date.now() - startFilter) / 1000).toFixed(1)}s`);

  // Get filtered file size
  const filteredStats = fs.statSync(filteredPbf);
  console.log(`  Filtered file size: ${(filteredStats.size / 1024 / 1024).toFixed(1)} MB`);

  console.log('\nStep 2: Exporting to GeoJSON...');
  
  // Step 2: Export to NDJSON (newline-delimited GeoJSON)
  // Using osmium export with geojsonseq format for streaming
  // --add-unique-id=type_id adds the OSM type and ID to each feature
  const exportCmd = `osmium export "${filteredPbf}" -f geojsonseq -o "${outputNdjson}" --overwrite --add-unique-id=type_id`;
  
  const startExport = Date.now();

  execSync(exportCmd, { stdio: 'inherit' });
  
  console.log(`  ✓ Export completed in ${((Date.now() - startExport) / 1000).toFixed(1)}s`);

  // Clean up filtered PBF
  fs.unlinkSync(filteredPbf);

  return outputNdjson;
}

/**
 * Parse NDJSON file and categorize POIs by factor_id
 * Uses streaming to handle large files efficiently
 */
export async function parsePOIsFromNdjson(
  ndjsonPath: string,
  onPOI: (poi: ExtractedPOI) => void
): Promise<{ total: number; byFactor: Record<string, number> }> {
  const stats = { total: 0, byFactor: {} as Record<string, number> };
  
  const fileStream = fs.createReadStream(ndjsonPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    
    try {
      // GeoJSON Sequence format (RFC 8142) uses 0x1e as record separator
      // Strip it if present at the beginning of the line
      const cleanLine = line.startsWith('\x1e') ? line.slice(1) : line;
      if (!cleanLine.trim()) continue;
      
      const feature = JSON.parse(cleanLine);
      
      // Skip if no geometry or not a point/polygon
      if (!feature.geometry) continue;
      
      // Get coordinates (centroid for polygons)
      let lat: number, lng: number;
      
      if (feature.geometry.type === 'Point') {
        [lng, lat] = feature.geometry.coordinates;
      } else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
        // Calculate centroid for polygons
        const coords = feature.geometry.type === 'Polygon' 
          ? feature.geometry.coordinates[0]
          : feature.geometry.coordinates[0][0];
        
        let sumLat = 0, sumLng = 0;
        for (const [pLng, pLat] of coords) {
          sumLat += pLat;
          sumLng += pLng;
        }
        lat = sumLat / coords.length;
        lng = sumLng / coords.length;
      } else if (feature.geometry.type === 'LineString') {
        // Use midpoint for lines (highways, railways)
        const coords = feature.geometry.coordinates;
        const midIdx = Math.floor(coords.length / 2);
        [lng, lat] = coords[midIdx];
      } else {
        continue;
      }

      const tags = feature.properties || {};
      const factorIds = getAllFactorIdsFromTags(tags);
      
      if (factorIds.length === 0) continue;

      // Extract OSM ID
      const osmId = feature.properties?.['@id'] || 
                    (feature.id ? parseInt(String(feature.id).replace(/\D/g, '')) : 0);

      // Create a POI for each matching factor
      // This allows the same OSM feature to be used by multiple factors
      // (e.g., place=city matches both city_center and city_downtown)
      for (const factorId of factorIds) {
        const poi: ExtractedPOI = {
          id: osmId,
          factor_id: factorId,
          lat,
          lng,
          name: tags.name || null,
          tags,
        };

        onPOI(poi);
        stats.total++;
        stats.byFactor[factorId] = (stats.byFactor[factorId] || 0) + 1;
      }
      
      // Progress indicator
      if (stats.total % 100000 === 0) {
        console.log(`  Processed ${stats.total.toLocaleString()} POIs...`);
      }
    } catch (e) {
      // Skip malformed lines
      continue;
    }
  }

  return stats;
}

/**
 * Main extraction function
 */
export async function extractPOIs(options: {
  pbfPath?: string;
  outputDir?: string;
  filterFile?: string;
}): Promise<{ outputPath: string; stats: { total: number; byFactor: Record<string, number> } }> {
  const pbfPath = options.pbfPath || './data/poland-latest.osm.pbf';
  const outputDir = options.outputDir || './data';
  const outputPath = path.join(outputDir, 'pois-extracted.ndjson');

  // Check osmium installation
  if (!checkOsmiumInstalled()) {
    console.error('Error: osmium-tool is not installed.');
    console.error('');
    console.error('Install it using:');
    console.error('  macOS:  brew install osmium-tool');
    console.error('  Ubuntu: apt-get install osmium-tool');
    console.error('  Fedora: dnf install osmium-tool');
    process.exit(1);
  }

  const version = getOsmiumVersion();
  console.log(`Using osmium-tool version: ${version}`);
  console.log('');

  // Check input file exists
  if (!fs.existsSync(pbfPath)) {
    console.error(`Error: PBF file not found: ${pbfPath}`);
    console.error('Run ./scripts/download-poland.sh first to download the data.');
    process.exit(1);
  }

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  // Generate osmium filters from common config (or use provided file)
  let filterFile = options.filterFile;
  if (!filterFile) {
    filterFile = path.join(outputDir, 'osmium-filters.txt');
    const filterContent = generateOsmiumFilters();
    fs.writeFileSync(filterFile, filterContent);
    console.log(`Generated osmium filters: ${filterFile}`);
  }

  // Extract POIs
  const ndjsonPath = await extractPOIsWithOsmium(pbfPath, outputDir, filterFile);

  console.log('\nStep 3: Categorizing POIs by factor...');
  
  // Parse and write categorized POIs
  const outputStream = fs.createWriteStream(outputPath);
  
  const stats = await parsePOIsFromNdjson(ndjsonPath, (poi) => {
    outputStream.write(JSON.stringify(poi) + '\n');
  });

  outputStream.end();

  // Clean up intermediate file
  fs.unlinkSync(ndjsonPath);

  console.log(`\n✓ Extraction complete!`);
  console.log(`  Total POIs: ${stats.total.toLocaleString()}`);
  console.log(`  Output: ${outputPath}`);
  console.log('\nPOIs by category:');
  
  const sortedFactors = Object.entries(stats.byFactor)
    .sort((a, b) => b[1] - a[1]);
  
  for (const [factor, count] of sortedFactors) {
    console.log(`  ${factor}: ${count.toLocaleString()}`);
  }

  return { outputPath, stats };
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: { pbfPath?: string; outputDir?: string } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pbf-path' && args[i + 1]) {
      options.pbfPath = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      options.outputDir = args[++i];
    }
  }

  extractPOIs(options).catch((err) => {
    console.error('Extraction failed:', err);
    process.exit(1);
  });
}
