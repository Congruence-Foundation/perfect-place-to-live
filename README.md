# Perfect Place - Living Location Heatmap

An interactive map application that helps identify the best locations to live based on proximity to various amenities. Built with Next.js, Leaflet, and OpenStreetMap data.

## Features

- **Interactive Heatmap**: Visualize location quality across the map with canvas-based rendering
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
git clone <repository-url>
cd map
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
3. **Calculate Heatmap**: Click Refresh to generate the heatmap for the current view
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

### Environment (7 categories - negative factors)
- **Water Bodies**: Lakes, rivers, coastlines (positive)
- **Industrial Areas**: Industrial zones, quarries (negative)
- **Major Roads**: Motorways, trunk roads, primary roads (negative)
- **Airports**: Airports, helipads, runways (negative)
- **Railway Tracks**: Railway lines, light rail (negative)
- **Cemeteries**: Cemeteries and graveyards (negative)
- **Construction Sites**: Active construction (negative)

## Real Estate Extension

The Real Estate extension integrates property listings from Polish real estate portals:

### Data Sources
- **Otodom** (otodom.pl) - Major Polish real estate portal
- **Gratka** (gratka.pl) - Polish classifieds with real estate

### Features
- **Property Filters**: Transaction type, estate type, price range, area, rooms, floor level
- **Advanced Filters**: Building type, material, market type, owner type, extras
- **Price Analysis**: Compare prices against similar properties in the same location quality tier
- **Deal Detection**: Identify great deals, good deals, fair prices, and overpriced listings
- **Location Score**: Filter properties by heatmap score (location quality)

## Scripts

The project includes scripts for managing POI data:

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

## Algorithm

The K-value (location quality score) is calculated as:

```
K = Σ (value × |weight|) / Σ |weight|
```

Where:
- For **positive weights** (prefer nearby): `value = normalizedDistance` (closer = lower K = better)
- For **negative weights** (avoid nearby): `value = 1 - normalizedDistance` (farther = lower K = better)
- `normalizedDistance` is transformed using configurable distance curves (log, linear, exp, power)

### Distance Curves

| Curve | Description | Use Case |
|-------|-------------|----------|
| **Logarithmic** | Very sensitive to nearby distances | Street-level precision |
| **Linear** | Uniform sensitivity | General use |
| **Exponential** | Sharp drop-off near POIs | When being very close matters most |
| **Power** | Moderate sensitivity (square root) | Balanced option |

### Density Bonus

Areas with multiple nearby POIs receive a bonus (up to 15% improvement) for positive factors.

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

The application uses a modular extension system:

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
