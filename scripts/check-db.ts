/**
 * Script to check database POI counts
 * 
 * Usage: npx tsx scripts/check-db.ts
 */

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL!);

async function checkDB() {
  console.log('Checking database...\n');

  // Total count
  const total = await sql`SELECT COUNT(*) as count FROM osm_pois`;
  console.log(`Total POIs: ${total[0].count}\n`);

  // Count by factor
  const counts = await sql`
    SELECT factor_id, COUNT(*) as count
    FROM osm_pois
    GROUP BY factor_id
    ORDER BY count DESC
  `;

  console.log('POIs by factor:');
  for (const row of counts as { factor_id: string; count: string }[]) {
    console.log(`  ${row.factor_id}: ${row.count}`);
  }

  // Sample query to test spatial index
  console.log('\nTesting spatial query (Warsaw center)...');
  const sample = await sql`
    SELECT factor_id, COUNT(*) as count
    FROM osm_pois
    WHERE geom && ST_MakeEnvelope(20.9, 52.2, 21.1, 52.3, 4326)
    GROUP BY factor_id
    ORDER BY count DESC
    LIMIT 5
  `;

  console.log('POIs in Warsaw center area:');
  for (const row of sample as { factor_id: string; count: string }[]) {
    console.log(`  ${row.factor_id}: ${row.count}`);
  }
}

checkDB().catch(console.error);
