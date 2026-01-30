/**
 * Heatmap Performance Profiling Script
 * 
 * Tests heatmap rendering performance for Polish cities with various configurations.
 * Run with: npx tsx scripts/profile-heatmap.ts
 */

interface CityConfig {
  name: string;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  description: string;
}

interface ProfileResult {
  city: string;
  gridSize: number;
  pointCount: number;
  computeTimeMs: number;
  totalRequestTimeMs: number;
  poiCounts: Record<string, number>;
  factorCount: number;
  kStats?: {
    min: number;
    max: number;
    avg: number;
    stdDev: number;
  };
}

// Polish cities with realistic viewport bounds (approximately city center area)
const POLISH_CITIES: CityConfig[] = [
  {
    name: 'Warsaw (Centrum)',
    bounds: { north: 52.245, south: 52.215, east: 21.025, west: 20.985 },
    description: 'Capital city center - dense urban area'
  },
  {
    name: 'Warsaw (Large)',
    bounds: { north: 52.30, south: 52.18, east: 21.10, west: 20.90 },
    description: 'Capital city - larger viewport'
  },
  {
    name: 'Krakow (Centrum)',
    bounds: { north: 50.075, south: 50.045, east: 19.960, west: 19.920 },
    description: 'Historic city center'
  },
  {
    name: 'Krakow (Large)',
    bounds: { north: 50.10, south: 50.02, east: 20.02, west: 19.88 },
    description: 'Krakow larger area'
  },
  {
    name: 'Gdansk (Centrum)',
    bounds: { north: 54.365, south: 54.340, east: 18.660, west: 18.620 },
    description: 'Baltic coast city center'
  },
  {
    name: 'Wroclaw (Centrum)',
    bounds: { north: 51.125, south: 51.095, east: 17.050, west: 17.010 },
    description: 'Silesian capital center'
  },
  {
    name: 'Poznan (Centrum)',
    bounds: { north: 52.420, south: 52.390, east: 16.940, west: 16.900 },
    description: 'Greater Poland capital'
  },
  {
    name: 'Lodz (Centrum)',
    bounds: { north: 51.780, south: 51.750, east: 19.480, west: 19.440 },
    description: 'Central Poland industrial city'
  },
  {
    name: 'Zakopane (Small)',
    bounds: { north: 49.305, south: 49.285, east: 19.970, west: 19.940 },
    description: 'Small mountain resort town'
  },
];

// Grid sizes to test (in meters)
const GRID_SIZES = [50, 100, 150, 200, 300];

// Default factors (balanced profile)
const DEFAULT_FACTORS = [
  { id: 'grocery', enabled: true, weight: 3, maxDistance: 800, osmTags: ['shop=supermarket', 'shop=convenience'] },
  { id: 'transit', enabled: true, weight: 3, maxDistance: 500, osmTags: ['highway=bus_stop', 'railway=tram_stop', 'railway=station'] },
  { id: 'healthcare', enabled: true, weight: 2, maxDistance: 1500, osmTags: ['amenity=pharmacy', 'amenity=clinic', 'amenity=hospital'] },
  { id: 'parks', enabled: true, weight: 2, maxDistance: 800, osmTags: ['leisure=park', 'leisure=garden'] },
  { id: 'schools', enabled: true, weight: 1, maxDistance: 1000, osmTags: ['amenity=school', 'amenity=kindergarten'] },
  { id: 'restaurants', enabled: true, weight: 1, maxDistance: 600, osmTags: ['amenity=restaurant', 'amenity=cafe'] },
  { id: 'industrial', enabled: true, weight: -2, maxDistance: 500, osmTags: ['landuse=industrial'] },
  { id: 'highways', enabled: true, weight: -1, maxDistance: 200, osmTags: ['highway=motorway', 'highway=trunk'] },
];

async function profileCity(
  city: CityConfig,
  gridSize: number,
  baseUrl: string
): Promise<ProfileResult | null> {
  const startTime = performance.now();
  
  try {
    const response = await fetch(`${baseUrl}/api/heatmap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bounds: city.bounds,
        factors: DEFAULT_FACTORS,
        gridSize,
        distanceCurve: 'exp',
        sensitivity: 2,
        normalizeToViewport: false,
      }),
    });

    const totalRequestTimeMs = performance.now() - startTime;

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error(`  ❌ ${city.name} @ ${gridSize}m: ${error.error || response.statusText}`);
      return null;
    }

    const data = await response.json();
    
    // Calculate K stats from points
    let kStats = undefined;
    if (data.points && data.points.length > 0) {
      const values = data.points.map((p: { value: number }) => p.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
      const stdDev = Math.sqrt(
        values.reduce((sum: number, v: number) => sum + Math.pow(v - avg, 2), 0) / values.length
      );
      kStats = { min, max, avg, stdDev };
    }

    return {
      city: city.name,
      gridSize,
      pointCount: data.metadata?.pointCount || data.points?.length || 0,
      computeTimeMs: data.metadata?.computeTimeMs || 0,
      totalRequestTimeMs: Math.round(totalRequestTimeMs),
      poiCounts: data.metadata?.poiCounts || {},
      factorCount: data.metadata?.factorCount || 0,
      kStats,
    };
  } catch (error) {
    console.error(`  ❌ ${city.name} @ ${gridSize}m: ${error}`);
    return null;
  }
}

async function runProfiling() {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         HEATMAP PERFORMANCE PROFILING - POLISH CITIES          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\nBase URL: ${baseUrl}`);
  console.log(`Testing ${POLISH_CITIES.length} cities with ${GRID_SIZES.length} grid sizes each\n`);

  const results: ProfileResult[] = [];
  
  // Test each city with different grid sizes
  for (const city of POLISH_CITIES) {
    console.log(`\n📍 ${city.name} - ${city.description}`);
    console.log(`   Bounds: N${city.bounds.north.toFixed(3)} S${city.bounds.south.toFixed(3)} E${city.bounds.east.toFixed(3)} W${city.bounds.west.toFixed(3)}`);
    
    for (const gridSize of GRID_SIZES) {
      const result = await profileCity(city, gridSize, baseUrl);
      
      if (result) {
        results.push(result);
        const totalPOIs = Object.values(result.poiCounts).reduce((a, b) => a + b, 0);
        console.log(
          `   ✓ ${gridSize}m grid: ${result.pointCount.toLocaleString()} pts, ` +
          `compute: ${result.computeTimeMs}ms, total: ${result.totalRequestTimeMs}ms, ` +
          `POIs: ${totalPOIs}`
        );
      }
      
      // Small delay between requests to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Print summary
  console.log('\n\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                      PERFORMANCE SUMMARY                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Group by grid size
  console.log('📊 Average Performance by Grid Size:\n');
  console.log('Grid Size │ Avg Points │ Avg Compute │ Avg Total │ Compute/Point');
  console.log('──────────┼────────────┼─────────────┼───────────┼──────────────');
  
  for (const gridSize of GRID_SIZES) {
    const gridResults = results.filter(r => r.gridSize === gridSize);
    if (gridResults.length === 0) continue;
    
    const avgPoints = Math.round(gridResults.reduce((a, r) => a + r.pointCount, 0) / gridResults.length);
    const avgCompute = Math.round(gridResults.reduce((a, r) => a + r.computeTimeMs, 0) / gridResults.length);
    const avgTotal = Math.round(gridResults.reduce((a, r) => a + r.totalRequestTimeMs, 0) / gridResults.length);
    const computePerPoint = avgPoints > 0 ? (avgCompute / avgPoints * 1000).toFixed(2) : 'N/A';
    
    console.log(
      `${String(gridSize).padStart(6)}m   │ ${String(avgPoints).padStart(10)} │ ${String(avgCompute).padStart(8)}ms │ ${String(avgTotal).padStart(7)}ms │ ${computePerPoint}µs`
    );
  }

  // Identify bottlenecks
  console.log('\n\n📈 Performance Bottleneck Analysis:\n');
  
  // Find slowest requests
  const sortedByTotal = [...results].sort((a, b) => b.totalRequestTimeMs - a.totalRequestTimeMs);
  console.log('Slowest Total Request Times:');
  sortedByTotal.slice(0, 5).forEach((r, i) => {
    const overhead = r.totalRequestTimeMs - r.computeTimeMs;
    console.log(
      `  ${i + 1}. ${r.city} @ ${r.gridSize}m: ${r.totalRequestTimeMs}ms total ` +
      `(compute: ${r.computeTimeMs}ms, overhead: ${overhead}ms)`
    );
  });

  // Find highest compute times
  const sortedByCompute = [...results].sort((a, b) => b.computeTimeMs - a.computeTimeMs);
  console.log('\nHighest Compute Times:');
  sortedByCompute.slice(0, 5).forEach((r, i) => {
    const perPoint = (r.computeTimeMs / r.pointCount * 1000).toFixed(2);
    console.log(
      `  ${i + 1}. ${r.city} @ ${r.gridSize}m: ${r.computeTimeMs}ms ` +
      `(${r.pointCount.toLocaleString()} pts, ${perPoint}µs/pt)`
    );
  });

  // Find highest point counts
  const sortedByPoints = [...results].sort((a, b) => b.pointCount - a.pointCount);
  console.log('\nHighest Point Counts:');
  sortedByPoints.slice(0, 5).forEach((r, i) => {
    console.log(
      `  ${i + 1}. ${r.city} @ ${r.gridSize}m: ${r.pointCount.toLocaleString()} points`
    );
  });

  // Calculate overhead analysis
  console.log('\n\n🔍 Overhead Analysis (Total - Compute = Network + JSON + POI Fetch):\n');
  const overheadResults = results.map(r => ({
    ...r,
    overhead: r.totalRequestTimeMs - r.computeTimeMs,
    overheadPercent: ((r.totalRequestTimeMs - r.computeTimeMs) / r.totalRequestTimeMs * 100).toFixed(1)
  }));
  
  const avgOverhead = Math.round(overheadResults.reduce((a, r) => a + r.overhead, 0) / overheadResults.length);
  const avgOverheadPercent = (overheadResults.reduce((a, r) => a + parseFloat(r.overheadPercent), 0) / overheadResults.length).toFixed(1);
  
  console.log(`Average overhead: ${avgOverhead}ms (${avgOverheadPercent}% of total request time)`);
  console.log('\nThis overhead includes:');
  console.log('  - POI fetching from Overpass API (if not cached)');
  console.log('  - JSON serialization/deserialization');
  console.log('  - Network latency');
  console.log('  - Next.js API route overhead');

  // K-value distribution analysis
  console.log('\n\n📉 K-Value Distribution (Score Quality):\n');
  const withKStats = results.filter(r => r.kStats);
  if (withKStats.length > 0) {
    console.log('City                    │ Grid │ K min │ K max │ K avg │ K stdDev');
    console.log('────────────────────────┼──────┼───────┼───────┼───────┼─────────');
    withKStats.slice(0, 10).forEach(r => {
      if (r.kStats) {
        console.log(
          `${r.city.padEnd(23)} │ ${String(r.gridSize).padStart(4)}m │ ${r.kStats.min.toFixed(3)} │ ${r.kStats.max.toFixed(3)} │ ${r.kStats.avg.toFixed(3)} │ ${r.kStats.stdDev.toFixed(3)}`
        );
      }
    });
  }

  // Final recommendations
  console.log('\n\n💡 RECOMMENDATIONS:\n');
  
  const avgComputePerPoint = results.reduce((a, r) => a + (r.computeTimeMs / r.pointCount), 0) / results.length * 1000;
  console.log(`1. Average compute time per point: ${avgComputePerPoint.toFixed(2)}µs`);
  console.log('   → Server-side calculation is efficient');
  
  const highOverheadResults = overheadResults.filter(r => r.overhead > 1000);
  if (highOverheadResults.length > 0) {
    console.log(`\n2. ${highOverheadResults.length} requests had >1s overhead (likely POI cache misses)`);
    console.log('   → Consider pre-warming POI cache for popular cities');
  }
  
  const highPointResults = results.filter(r => r.pointCount > 10000);
  if (highPointResults.length > 0) {
    console.log(`\n3. ${highPointResults.length} requests generated >10k points`);
    console.log('   → Client-side DOM rendering is the main bottleneck for these');
    console.log('   → Recommend: Canvas/WebGL rendering instead of Leaflet rectangles');
  }

  console.log('\n✅ Profiling complete!\n');
}

// Run the profiling
runProfiling().catch(console.error);
