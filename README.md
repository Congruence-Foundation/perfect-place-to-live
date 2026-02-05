# Perfect Place - Living Location Heatmap

An interactive map application that helps identify the best locations to live based on proximity to various amenities. Built with Next.js, Leaflet, and OpenStreetMap data.

**[Live Demo](https://perfect-place-to-live.vercel.app/)**

## Screenshots

![Heatmap Demo](docs/images/heatmap-demo.png)
*Location quality heatmap with factor-based scoring*

![Price Analysis Demo](docs/images/price-analysis-demo.png)
*Real estate price analysis with deal detection*

## Features

- **Interactive Heatmap**: Visualize location quality across the map with canvas-based rendering
- **Power Mean Scoring**: Weight-dependent formula where critical factors have outsized influence
- **9 User Profiles**: Pre-configured factor weights for different lifestyles (Family, Urban Pro, Student, etc.)
- **27 POI Categories**: Comprehensive amenity coverage organized into Essential, Lifestyle, and Environment
- **Real Estate Extension**: Browse property listings from Otodom and Gratka with price analysis
- **Customizable Factors**: Adjust weights for different amenities with positive/negative preferences
- **Multi-language Support**: English and Polish interfaces
- **Mobile Responsive**: Adaptive UI with bottom sheet for mobile devices
- **Tile-based Caching**: Multi-level caching with Redis + LRU for fast performance
- **Price Analysis**: Compare property prices and detect deals based on location quality

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS 4
- **Map**: Leaflet with canvas-based heatmap rendering
- **UI Components**: shadcn/ui (Radix UI primitives)
- **State Management**: Zustand, TanStack Query
- **Data Sources**:
  - POIs: Neon PostgreSQL (PostGIS) with Overpass API fallback
  - Properties: Otodom and Gratka APIs
- **Caching**: Upstash Redis + LRU in-memory cache
- **i18n**: next-intl

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- (Optional) Neon PostgreSQL database for POI data
- (Optional) Upstash Redis for caching

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Congruence-Foundation/perfect-place-to-live.git
cd perfect-place-to-live
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env.local
```

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Navigate the Map**: Pan and zoom to your area of interest in Poland
2. **Select a Profile**: Choose from 9 pre-configured profiles or customize factors
3. **View Heatmap**: The heatmap updates automatically as you navigate
4. **Analyze Locations**: Right-click (or long-press on mobile) for detailed factor breakdown
5. **Browse Properties**: Enable Real Estate to see property listings with price analysis
6. **Interpret Colors**:
   - **Green**: Excellent location (close to preferred amenities, far from negative factors)
   - **Yellow**: Average location
   - **Red**: Poor location (far from amenities or close to negative factors)

## User Profiles

| Profile | Description | Key Factors |
|---------|-------------|-------------|
| **Balanced** | Well-rounded for general living | All essentials equally weighted |
| **Family** | Schools, parks, playgrounds, quiet areas | Schools (100), Parks (95), Playgrounds (95), Nightlife (-65) |
| **Urban Pro** | Transit, nightlife, gyms, urban living | Transit (100), Restaurants (85), Gyms (80) |
| **Remote Worker** | Quiet, parks, cafes, less transit focus | Parks (90), Restaurants (75), Industrial (-70) |
| **Active Lifestyle** | Gyms, parks, sports facilities | Gyms (100), Parks (90), Stadiums (70) |
| **Student** | Universities, transit, affordable food, nightlife | Universities (100), Transit (90), Nightlife (70) |
| **Settled** | Quality dining, culture, quiet residential | Restaurants (85), Cinemas (75), Industrial (-60) |
| **Senior** | Healthcare, quiet, accessible services | Healthcare (100), Parks (80), Highways (-70) |
| **Suburban** | Outside city, railway commute, basic amenities | Train Stations (100), Parks (85), City Downtown (-50) |

## POI Categories

### Essential (6 categories)
- **Grocery Stores**: Supermarkets, convenience stores, grocery shops
- **Public Transit**: Train stations, bus stops, tram stops, transit platforms
- **Healthcare**: Pharmacies, hospitals, clinics, doctor offices
- **Parks & Green Areas**: Parks, forests, woodlands, gardens
- **Schools**: Schools, kindergartens, colleges
- **Post & Delivery**: Post offices, parcel lockers, post boxes

### Lifestyle (14 categories)
- **Train Stations**: Railway stations and halts
- **Restaurants & Cafes**: Restaurants, cafes, fast food
- **Banks & ATMs**: Banks and ATM machines
- **Gyms & Sports**: Fitness centers, sports centers, swimming pools
- **Playgrounds**: Children's playgrounds
- **Stadiums & Arenas**: Sports stadiums and buildings
- **Nightlife & Bars**: Bars, pubs, nightclubs, beer gardens
- **Universities**: Universities and university buildings
- **Religious Sites**: Places of worship, churches, mosques, synagogues
- **Dog Parks**: Dedicated dog parks
- **Coworking & Libraries**: Coworking spaces, libraries
- **Cinemas & Theaters**: Cinemas and theaters
- **Markets & Bazaars**: Marketplaces, shopping malls, retail areas
- **City/Town Access**: Proximity to city and town centers

### Environment (7 categories)
- **Water Bodies**: Lakes, rivers, coastlines (positive by default)
- **Industrial Areas**: Industrial zones, quarries (negative)
- **Major Roads**: Motorways, trunk roads, primary roads (negative)
- **Airports**: Airports, helipads, runways (negative)
- **Railway Tracks**: Railway lines, light rail (negative)
- **Cemeteries**: Cemeteries and graveyards (negative)
- **Construction Sites**: Active construction (negative)

## Algorithm

### K-Value Calculation (Location Quality Score)

The K-value represents location quality where **lower K = better location**. It uses a **weight-dependent power mean** formula that allows high-priority factors to have outsized influence on the final score.

#### Power Mean Formula

```
K = (Σ |wᵢ| × vᵢ^pᵢ / Σ |wᵢ|)^(1/p̄)
```

Where:
- `wᵢ` = factor weight (-100 to +100)
- `vᵢ` = normalized distance value (0-1) for factor i
- `pᵢ` = weight-dependent exponent: `p = 1 + λ × (|w|/100)²`
- `p̄` = weighted average exponent
- `λ` = asymmetry strength parameter (configurable via "Weight Impact" slider)

#### Weight Impact (Lambda Parameter)

The lambda parameter controls how much high-weight factors dominate the score:

| Setting | Lambda | Behavior |
|---------|--------|----------|
| Equalizer | -0.5 | Low-weight factors gain importance |
| Balanced | 0 | Standard arithmetic mean |
| Mild | 0.5 | Slight preference for high-weight factors |
| Moderate | 1.0 | Moderate preference |
| **Strong** | **2.0** | High-weight factors dominate (default) |
| Very Strong | 3.0 | Single critical factor can significantly impact score |
| Extreme | 5.0 | Near deal-breaker behavior for critical factors |

#### Factor Value Calculation

For each factor:
- **Positive weights** (prefer nearby): `value = normalizedDistance` (closer = lower K = better)
- **Negative weights** (avoid nearby): `value = 1 - normalizedDistance` (farther = lower K = better)
- **No POIs found**: Positive factors get worst score (1), negative factors get best score (0)

#### Distance Curves

The `normalizedDistance` is transformed using configurable curves:

| Curve | Formula | Use Case |
|-------|---------|----------|
| **Logarithmic** | `log(1 + ratio×(base-1)) / log(base)` | Street-level precision |
| **Linear** | `ratio` | General use |
| **Exponential** | `(e^(ratio×s) - 1) / (e^s - 1)` | Sharp drop-off near POIs |
| **Power** | `ratio^(1/s)` | Balanced option |

Where `ratio = distance / maxDistance` and `s` = sensitivity parameter.

#### Sensitivity Parameter

Controls the steepness of distance curves (range: 0.5 to 3.0, default: 1.0):
- **Lower values (0.5)**: Gentler curves, more gradual score changes
- **Higher values (3.0)**: Steeper curves, sharper distinction between close and far

#### Density Bonus

Areas with multiple nearby POIs receive a bonus for positive factors:

```
bonus = 0.15 × (1 - 1/(count/3 + 1))
```

This provides diminishing returns: 1 extra POI ≈ 3.75% bonus, 3 extra ≈ 7.5%, approaches 15% max asymptotically.

#### Relative Mode (Normalize to Viewport)

When enabled, K-values are normalized relative to the current viewport:
- Scores are scaled so the best location in view = 0 (green) and worst = 1 (red)
- Useful for comparing locations within a specific area
- Disabled by default for consistent absolute scoring

### Factor Breakdown

Right-click (desktop) or long-press (mobile) on any location to see a detailed breakdown:
- Individual factor contributions to the K-value
- Distance to nearest POI for each factor
- Effective exponent based on weight and lambda
- Count of nearby POIs within range

## Real Estate Extension

### Data Sources
- **Otodom** (otodom.pl) - Major Polish real estate portal
- **Gratka** (gratka.pl) - Polish classifieds with real estate

### Features
- **Property Filters**: Transaction type, estate type, price range, area, rooms, floor level
- **Advanced Filters**: Building type, material, market type, owner type, extras
- **Price Analysis**: Compare prices against similar properties in the same location quality tier
- **Deal Detection**: Identify great deals, good deals, fair prices, and overpriced listings
- **Location Score**: Filter properties by heatmap score (location quality)

### Price Analysis Algorithm

Properties are enriched with price analysis by comparing against similar properties:

#### Grouping Strategy

Properties are grouped by:
1. **Estate Type**: Flat, House, etc.
2. **Room Count**: Overlapping ranges (1-2, 2-3, 3-4, 4-5, 5+)
3. **Area Range**: <40m², 40-55m², 55-75m², 75-100m², 100+m²
4. **Location Quality Tier**: 0-20%, 20-40%, 40-60%, 60-80%, 80-100%

#### Price Score Calculation

```
priceScore = 50 + (pricePerMeter - medianPrice) / stdDev × 15
```

Clamped to 0-100 range. Lower score = better deal.

#### Price Categories

| Category | Score Range | Description |
|----------|-------------|-------------|
| Great Deal | 0-25 | Significantly below market |
| Good Deal | 25-40 | Below market average |
| Fair | 40-60 | Around market average |
| Above Average | 60-75 | Above market average |
| Overpriced | 75-100 | Significantly above market |

### Analysis Modes

#### Simplified Mode (Default)
- Uses nearby loaded properties for price comparison
- Fast, works with already-fetched data
- May have limited comparison data in sparse areas

#### Detailed Mode
- Fetches actual property data from API for each cluster
- More accurate price analysis with larger comparison groups
- Slower due to additional API calls
- Configurable threshold: clusters larger than threshold fall back to simplified mode

## Settings Reference

### Heatmap Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Distance Curve** | How distance affects score | Exponential |
| **Sensitivity** | Curve steepness (0.5-3.0) | 1.0 |
| **Weight Impact** | Lambda parameter for power mean | Strong (2.0) |
| **Relative Mode** | Normalize scores to viewport | Off |
| **Heatmap Area** | Tile radius for calculation | Viewport |
| **POI Buffer** | Extra POI fetch distance | 2x |

### Debug Options

| Setting | Description |
|---------|-------------|
| **Heatmap Tiles** | Show tile boundaries (zoom 13) |
| **Property Tiles** | Show property tile boundaries (zoom 14+) |

## Performance Tips

- **Optimal Zoom**: Zoom levels 12-15 provide the best balance of detail and performance
- **Factor Count**: Disable unused factors to speed up calculations
- **POI Buffer**: Use 1x for faster loading, 2x for more accurate edge scoring
- **Tile Radius**: Viewport-only is fastest; +1/+2 tiles provide smoother panning

## Known Limitations

- **Geographic Coverage**: POI data is currently focused on Poland
- **Real Estate Data**: Property listings are from Polish portals (Otodom, Gratka)
- **API Rate Limits**: Overpass API fallback may be slow during high traffic
- **Mobile Performance**: Complex heatmaps may be slower on older mobile devices
- **Data Freshness**: 
  - Neon DB: Updated periodically via sync scripts
  - Overpass API: Real-time but slower
  - Property listings: Fetched live from portals

## Browser Compatibility

| Browser | Support |
|---------|---------|
| Chrome 90+ | Full |
| Firefox 90+ | Full |
| Safari 14+ | Full |
| Edge 90+ | Full |
| Mobile Chrome | Full |
| Mobile Safari | Full |

## Scripts

### POI Sync Pipeline

```bash
# Initialize database schema
npx tsx scripts/run-schema.ts

# Full Poland sync (downloads ~2GB PBF file)
npx tsx scripts/sync-pois.ts

# Sync specific region
npx tsx scripts/sync-pois.ts --region poznan
npx tsx scripts/sync-pois.ts --region warsaw

# Custom bounding box
npx tsx scripts/sync-pois.ts --bbox "16.8,52.3,17.1,52.5"

# Use cached PBF (skip download)
npx tsx scripts/sync-pois.ts --skip-download

# Preview changes without applying
npx tsx scripts/sync-pois.ts --dry-run

# Check database status
npx tsx scripts/check-db.ts
```

### Available Regions
Major cities: `poznan`, `warsaw`, `krakow`, `wroclaw`, `gdansk`, `lodz`, `katowice`, `szczecin`, `lublin`, `bialystok`

## API Endpoints

### Heatmap

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/heatmap` | POST | Calculate heatmap for given bounds and factors |
| `/api/heatmap/batch` | POST | Batch calculate heatmap for multiple tiles |
| `/api/heatmap/tile` | POST | Calculate heatmap for a single tile |

### POI

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/poi` | GET/POST | Fetch POIs for specific factors within bounds |

### Properties

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/properties` | POST | Fetch real estate properties with filters |
| `/api/properties/cluster` | POST | Fetch properties within a cluster area |

### Tiles & Cache

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tiles` | GET | Retrieve pre-computed tiles |
| `/api/tiles/generate` | POST | Generate pre-computed tiles (admin) |
| `/api/cache/status` | GET | Cache diagnostics and statistics |

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | Neon PostgreSQL connection (pooled) | For DB mode |
| `DATABASE_URL_UNPOOLED` | Direct PostgreSQL connection | For schema ops |
| `OVERPASS_API_URL` | Overpass API endpoint | No (has default) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL | No |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token | No |
| `ADMIN_SECRET` | Secret for tile generation | For tile generation |

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Self-hosted

```bash
npm run build
npm start
```

## Architecture

```
src/
├── app/              # Next.js app router pages and API routes
├── components/       # React components (Controls, Map, UI)
├── config/           # Factor and POI category definitions
├── constants/        # Colors, icons, performance settings
├── extensions/       # Modular extensions (real-estate)
├── hooks/            # Custom React hooks
├── i18n/             # Internationalization setup
├── lib/              # Core utilities (geo, poi, scoring, caching)
├── messages/         # Translation files (en.json, pl.json)
├── stores/           # Zustand state stores
└── types/            # TypeScript type definitions
```

## License

MIT
