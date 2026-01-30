-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- Main POI table
-- ============================================================================
CREATE TABLE IF NOT EXISTS osm_pois (
    id BIGINT PRIMARY KEY,
    factor_id VARCHAR(50) NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    geom GEOMETRY(Point, 4326) NOT NULL,
    name VARCHAR(255),
    tags JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Spatial index for fast bounding box queries
CREATE INDEX IF NOT EXISTS idx_osm_pois_geom ON osm_pois USING GIST (geom);

-- Index for factor filtering
CREATE INDEX IF NOT EXISTS idx_osm_pois_factor ON osm_pois (factor_id);

-- Compound index for common query pattern
CREATE INDEX IF NOT EXISTS idx_osm_pois_factor_geom ON osm_pois USING GIST (geom) WHERE factor_id IS NOT NULL;

-- ============================================================================
-- Staging table for bulk POI imports
-- This table is used during sync operations and dropped after completion
-- ============================================================================
-- Note: This table is created dynamically by sync-pois.ts
-- CREATE TABLE IF NOT EXISTS osm_pois_staging (
--     id BIGINT PRIMARY KEY,
--     factor_id VARCHAR(50) NOT NULL,
--     lat DOUBLE PRECISION NOT NULL,
--     lng DOUBLE PRECISION NOT NULL,
--     name VARCHAR(255),
--     tags JSONB
-- );

-- ============================================================================
-- Sync metadata table
-- Tracks POI synchronization history for monitoring and debugging
-- ============================================================================
CREATE TABLE IF NOT EXISTS poi_sync_metadata (
    id SERIAL PRIMARY KEY,
    sync_date TIMESTAMP DEFAULT NOW(),
    pois_extracted INTEGER,
    pois_imported INTEGER,
    pois_added INTEGER,
    pois_updated INTEGER,
    pois_deleted INTEGER,
    duration_seconds NUMERIC,
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    source_file VARCHAR(255),
    source_date TIMESTAMP
);

-- Index for querying sync history
CREATE INDEX IF NOT EXISTS idx_sync_metadata_date ON poi_sync_metadata (sync_date DESC);

-- ============================================================================
-- Helper function to get sync statistics
-- ============================================================================
CREATE OR REPLACE FUNCTION get_poi_stats()
RETURNS TABLE (
    factor_id VARCHAR(50),
    poi_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT o.factor_id, COUNT(*) as poi_count
    FROM osm_pois o
    GROUP BY o.factor_id
    ORDER BY poi_count DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Helper function to get last sync info
-- ============================================================================
CREATE OR REPLACE FUNCTION get_last_sync()
RETURNS TABLE (
    sync_date TIMESTAMP,
    total_pois BIGINT,
    added INTEGER,
    updated INTEGER,
    deleted INTEGER,
    duration_seconds NUMERIC,
    status VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.sync_date,
        (SELECT COUNT(*) FROM osm_pois) as total_pois,
        m.pois_added,
        m.pois_updated,
        m.pois_deleted,
        m.duration_seconds,
        m.status
    FROM poi_sync_metadata m
    ORDER BY m.sync_date DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;
