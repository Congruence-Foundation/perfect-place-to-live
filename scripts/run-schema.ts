/**
 * Script to run the database schema against Neon PostgreSQL
 * 
 * Usage: npx tsx scripts/run-schema.ts
 */

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const DATABASE_URL = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL or DATABASE_URL_UNPOOLED not found in environment');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function runSchema() {
  console.log('Running schema against Neon database...\n');

  try {
    // Enable PostGIS
    console.log('1. Enabling PostGIS extension...');
    await sql`CREATE EXTENSION IF NOT EXISTS postgis`;
    console.log('   ✓ PostGIS enabled\n');

    // Create table
    console.log('2. Creating osm_pois table...');
    await sql`
      CREATE TABLE IF NOT EXISTS osm_pois (
        id BIGINT PRIMARY KEY,
        factor_id VARCHAR(50) NOT NULL,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        geom GEOMETRY(Point, 4326) NOT NULL,
        name VARCHAR(255),
        tags JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('   ✓ Table created\n');

    // Create spatial index
    console.log('3. Creating spatial index...');
    await sql`CREATE INDEX IF NOT EXISTS idx_osm_pois_geom ON osm_pois USING GIST (geom)`;
    console.log('   ✓ Spatial index created\n');

    // Create factor index
    console.log('4. Creating factor index...');
    await sql`CREATE INDEX IF NOT EXISTS idx_osm_pois_factor ON osm_pois (factor_id)`;
    console.log('   ✓ Factor index created\n');

    // Create compound index
    console.log('5. Creating compound index...');
    await sql`CREATE INDEX IF NOT EXISTS idx_osm_pois_factor_geom ON osm_pois USING GIST (geom) WHERE factor_id IS NOT NULL`;
    console.log('   ✓ Compound index created\n');

    // Verify
    console.log('6. Verifying setup...');
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'osm_pois'
    `;
    
    if (tables.length > 0) {
      console.log('   ✓ Table osm_pois exists\n');
    } else {
      console.log('   ✗ Table osm_pois not found\n');
    }

    const extensions = await sql`
      SELECT extname FROM pg_extension WHERE extname = 'postgis'
    `;
    
    if (extensions.length > 0) {
      console.log('   ✓ PostGIS extension is active\n');
    } else {
      console.log('   ✗ PostGIS extension not found\n');
    }

    console.log('Schema setup complete!');
  } catch (error) {
    console.error('Error running schema:', error);
    process.exit(1);
  }
}

runSchema();
