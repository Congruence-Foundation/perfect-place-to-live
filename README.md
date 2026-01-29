# Living Location Heatmap Viewer

An interactive map application that helps identify the best locations to live based on proximity to various amenities. Built with Next.js, Leaflet, and OpenStreetMap data.

## Features

- **Interactive Heatmap**: Visualize location quality across the map
- **Customizable Factors**: Adjust weights for different amenities (grocery stores, transit, parks, etc.)
- **Real-time Calculation**: Compute heatmap on-the-fly based on current viewport
- **Pre-computed Tiles**: Option for faster loading with pre-generated tiles
- **Negative Factors**: Account for undesirable proximity (industrial areas, highways)

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Map**: Leaflet, react-leaflet, leaflet.heat
- **UI Components**: shadcn/ui
- **Data Source**: OpenStreetMap via Overpass API
- **Caching**: Upstash Redis

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

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
2. **Zoom In**: The heatmap will appear when you zoom into a city-level view
3. **Adjust Factors**: Use the control panel to enable/disable factors and adjust their weights
4. **Interpret Colors**:
   - **Green**: Excellent location (close to amenities, far from negative factors)
   - **Yellow**: Average location
   - **Red**: Poor location (far from amenities or close to negative factors)

## Factors

### Essential (Enabled by Default)
- Grocery Stores (supermarkets, convenience stores)
- Public Transit (train stations, bus stops, tram stops)
- Healthcare (pharmacies, hospitals, clinics)
- Parks & Green Areas
- Schools (schools, kindergartens)
- Post & Delivery (post offices, parcel lockers)

### Lifestyle (Optional)
- Restaurants & Cafes
- Banks & ATMs
- Gyms & Sports facilities
- Playgrounds

### Negative Factors
- Industrial Areas (increases K value when nearby)
- Major Roads (highways, trunk roads)

## API Endpoints

### POST /api/heatmap
Calculate heatmap for given bounds and factors.

### POST /api/poi
Fetch POIs for specific factors within bounds.

### GET /api/tiles
Retrieve pre-computed tiles.

### POST /api/tiles/generate
Generate pre-computed tiles (requires admin secret).

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
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

## Algorithm

The K-value (location quality score) is calculated as:

```
K = Σ (wᵢ × f(dᵢ)) / Σ wᵢ
```

Where:
- `wᵢ` = weight for factor i
- `dᵢ` = distance to nearest POI of type i
- `f(d)` = normalized distance (capped at maxDistance)

Lower K = better location.

For negative factors, the formula is inverted so that closer proximity increases K (worse score).

## License

MIT
