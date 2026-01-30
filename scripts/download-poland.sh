#!/bin/bash
# Download Poland OSM PBF from Geofabrik with resume support
# Usage: ./scripts/download-poland.sh [output_dir]

set -e

OUTPUT_DIR="${1:-./data}"
PBF_URL="https://download.geofabrik.de/europe/poland-latest.osm.pbf"
PBF_FILE="$OUTPUT_DIR/poland-latest.osm.pbf"
MD5_URL="https://download.geofabrik.de/europe/poland-latest.osm.pbf.md5"

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

echo "=== Poland OSM PBF Downloader ==="
echo "Output directory: $OUTPUT_DIR"
echo "URL: $PBF_URL"
echo ""

# Download MD5 checksum first
echo "Downloading MD5 checksum..."
curl -s "$MD5_URL" -o "$OUTPUT_DIR/poland-latest.osm.pbf.md5"

# Check if file exists and verify checksum
if [ -f "$PBF_FILE" ]; then
    echo "Existing file found, verifying checksum..."
    cd "$OUTPUT_DIR"
    if md5sum -c poland-latest.osm.pbf.md5 2>/dev/null || md5 -r poland-latest.osm.pbf | grep -q "$(cat poland-latest.osm.pbf.md5 | awk '{print $1}')"; then
        echo "✓ File is up to date, skipping download"
        exit 0
    else
        echo "Checksum mismatch, re-downloading..."
    fi
    cd - > /dev/null
fi

# Download with resume support
echo "Downloading Poland PBF (~2GB)..."
echo "This may take 2-5 minutes depending on your connection..."
curl -L -C - --progress-bar "$PBF_URL" -o "$PBF_FILE"

# Verify download
echo ""
echo "Verifying download..."
cd "$OUTPUT_DIR"
if md5sum -c poland-latest.osm.pbf.md5 2>/dev/null || md5 -r poland-latest.osm.pbf | grep -q "$(cat poland-latest.osm.pbf.md5 | awk '{print $1}')"; then
    echo "✓ Download verified successfully"
    echo "File size: $(du -h poland-latest.osm.pbf | cut -f1)"
else
    echo "✗ Checksum verification failed!"
    exit 1
fi
