/**
 * Bulk import POIs to Neon PostgreSQL using fast parallel operations
 * 
 * This script:
 * 1. Creates an UNLOGGED staging table (faster, no WAL overhead)
 * 2. Bulk inserts POIs using parallel batched INSERT statements
 * 3. Provides progress tracking and error handling
 * 
 * Performance optimizations:
 * - Parallel batch inserts with concurrency control
 * - Larger batch sizes (3000 vs 1000)
 * - UNLOGGED staging table
 * - No tags in staging (preserved from main table during upsert)
 * 
 * Usage: npx tsx scripts/bulk-import.ts [--input <path>] [--batch-size <n>] [--concurrency <n>]
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

// Batch size for bulk inserts (larger batches = fewer round trips)
const DEFAULT_BATCH_SIZE = 3000;

// Number of parallel batch inserts
const DEFAULT_CONCURRENCY = 4;

/**
 * Split array into chunks of specified size
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Create UNLOGGED staging table for bulk import
 * UNLOGGED tables are faster because they don't write to WAL
 * Note: No tags column - tags are preserved from main table during upsert
 */
export async function createStagingTable(sql: NeonQueryFunction<false, false>): Promise<void> {
  console.log('Creating staging table...');
  
  await sql`
    DROP TABLE IF EXISTS osm_pois_staging;
  `;
  
  await sql`
    CREATE UNLOGGED TABLE osm_pois_staging (
      id BIGINT NOT NULL,
      factor_id VARCHAR(50) NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      name VARCHAR(255),
      PRIMARY KEY (id, factor_id)
    );
  `;
  
  console.log('✓ Staging table created');
}

/**
 * Bulk insert POIs into staging table (without tags for performance)
 */
export async function bulkInsertToStaging(
  sql: NeonQueryFunction<false, false>,
  pois: ExtractedPOI[]
): Promise<number> {
  if (pois.length === 0) return 0;

  // Build VALUES clause for bulk insert (no tags - much smaller payload)
  const values = pois.map(poi => {
    const name = poi.name ? poi.name.replace(/'/g, "''").substring(0, 255) : null;
    return `(${poi.id}, '${poi.factor_id}', ${poi.lat}, ${poi.lng}, ${name ? `'${name}'` : 'NULL'})`;
  }).join(',\n');

  const query = `
    INSERT INTO osm_pois_staging (id, factor_id, lat, lng, name)
    VALUES ${values}
    ON CONFLICT (id, factor_id) DO UPDATE SET
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      name = EXCLUDED.name
  `;

  try {
    // Use sql.query() for raw SQL execution instead of sql.unsafe()
    await sql.query(query, []);
    return pois.length;
  } catch (error) {
    // If batch fails, try inserting one by one to identify problematic records
    console.warn(`\nBatch insert failed, falling back to individual inserts...`);
    console.warn(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    let inserted = 0;
    for (const poi of pois) {
      try {
        await sql`
          INSERT INTO osm_pois_staging (id, factor_id, lat, lng, name)
          VALUES (${poi.id}, ${poi.factor_id}, ${poi.lat}, ${poi.lng}, ${poi.name})
          ON CONFLICT (id, factor_id) DO UPDATE SET
            lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            name = EXCLUDED.name
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
 * Stream POIs from NDJSON file and bulk insert to staging with parallel processing
 */
export async function importFromNdjson(
  sql: NeonQueryFunction<false, false>,
  inputPath: string,
  batchSize: number = DEFAULT_BATCH_SIZE,
  concurrency: number = DEFAULT_CONCURRENCY
): Promise<{ total: number; inserted: number; errors: number }> {
  const stats = { total: 0, inserted: 0, errors: 0 };
  
  const fileStream = fs.createReadStream(inputPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let currentBatch: ExtractedPOI[] = [];
  const pendingBatches: ExtractedPOI[][] = [];
  const startTime = Date.now();

  for await (const line of rl) {
    if (!line.trim()) continue;
    
    try {
      const poi: ExtractedPOI = JSON.parse(line);
      currentBatch.push(poi);
      stats.total++;

      // When current batch is full, add to pending batches
      if (currentBatch.length >= batchSize) {
        pendingBatches.push(currentBatch);
        currentBatch = [];

        // When we have enough pending batches, process them in parallel
        if (pendingBatches.length >= concurrency) {
          const results = await Promise.all(
            pendingBatches.map(batch => bulkInsertToStaging(sql, batch))
          );
          
          for (let i = 0; i < results.length; i++) {
            stats.inserted += results[i];
            stats.errors += pendingBatches[i].length - results[i];
          }
          pendingBatches.length = 0; // Clear pending batches

          // Progress update
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = Math.round(stats.inserted / elapsed);
          process.stdout.write(`\r  Imported ${stats.inserted.toLocaleString()} POIs (${rate}/s)...`);
        }
      }
    } catch (e) {
      stats.errors++;
    }
  }

  // Add remaining current batch to pending
  if (currentBatch.length > 0) {
    pendingBatches.push(currentBatch);
  }

  // Process any remaining pending batches in parallel
  if (pendingBatches.length > 0) {
    const results = await Promise.all(
      pendingBatches.map(batch => bulkInsertToStaging(sql, batch))
    );
    
    for (let i = 0; i < results.length; i++) {
      stats.inserted += results[i];
      stats.errors += pendingBatches[i].length - results[i];
    }
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
  concurrency?: number;
}): Promise<{ total: number; inserted: number; errors: number }> {
  const inputPath = options.inputPath || './data/pois-extracted.ndjson';
  const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
  const concurrency = options.concurrency || DEFAULT_CONCURRENCY;

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
  console.log(`Concurrency: ${concurrency}`);
  console.log('');

  // Create staging table
  await createStagingTable(sql);

  // Import POIs
  console.log('Importing POIs to staging table...');
  const startTime = Date.now();
  const stats = await importFromNdjson(sql, inputPath, batchSize, concurrency);
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
  const options: { inputPath?: string; batchSize?: number; concurrency?: number } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      options.inputPath = args[++i];
    } else if (args[i] === '--batch-size' && args[i + 1]) {
      options.batchSize = parseInt(args[++i]);
    } else if (args[i] === '--concurrency' && args[i + 1]) {
      options.concurrency = parseInt(args[++i]);
    }
  }

  bulkImport(options).catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
  });
}
