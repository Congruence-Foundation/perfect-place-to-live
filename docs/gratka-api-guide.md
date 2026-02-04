# Gratka.pl API Reverse Engineering Guide

## Overview

This guide helps you reverse engineer the Gratka.pl real estate search API using Playwright to capture network requests.

## Setup

### 1. Install Playwright

```bash
npm install -D playwright
npx playwright install chromium
```

### 2. Run the Capture Script

```bash
npx tsx scripts/capture-gratka-api.ts
```

This will:
- Open a browser window to gratka.pl
- Intercept all API requests
- Save captured data to `captured-gratka-api.json`

### 3. Interact with the Website

While the browser is open:
- **Search for properties**: Use filters like location, price, rooms, area
- **Navigate pages**: Click through search results
- **View listings**: Click on individual property listings
- **Try different property types**: mieszkania, domy, działki

### 4. Stop and Save

Press `Ctrl+C` to save captured requests and exit.

### 5. Analyze the Captured Data

```bash
npx tsx scripts/analyze-gratka-api.ts
```

This generates:
- `gratka-api-report.md` - Detailed analysis of discovered endpoints
- `scripts/gratka-client-stub.ts` - Auto-generated TypeScript client stub

## What to Look For

### Common API Patterns on Polish Real Estate Sites

Based on similar sites (otodom.pl, etc.), look for:

1. **Search Endpoints**
   - Usually POST or GET to `/api/search` or similar
   - Query params: `location`, `price_min`, `price_max`, `area_min`, `rooms`, `page`

2. **Listing Details**
   - GET to `/api/listing/{id}` or `/api/offer/{id}`
   - Returns full property details

3. **Autocomplete/Suggestions**
   - GET to `/api/suggest` or `/api/autocomplete`
   - Used for location search

4. **GraphQL** (if used)
   - POST to `/graphql` or `/api/graphql`
   - Look for query names like `SearchListings`, `GetOffer`

## Tips

### Finding the Right Requests

1. **Filter by XHR/Fetch** in DevTools Network tab
2. **Search for keywords** in response bodies (e.g., property address, price)
3. **Look for JSON responses** - these are usually API calls

### Testing Requests

Use the captured data to test requests in:
- **Postman/Insomnia** - Import cURL commands
- **Browser DevTools** - Copy as fetch
- **Terminal** - Use curl directly

### Required Headers

Common headers that might be required:
- `User-Agent` - Browser identification
- `Accept` - `application/json`
- `X-Requested-With` - `XMLHttpRequest`
- `Cookie` - Session cookies (if authenticated)

## Example: Building a Client

After capturing and analyzing, you can build a client like:

```typescript
import { GratkaClient } from './gratka-client';

const client = new GratkaClient();

// Search for apartments in Warsaw
const results = await client.search({
  location: 'warszawa',
  type: 'mieszkanie',
  transaction: 'sprzedaz',
  price_max: 500000,
  page: 1,
});

// Get listing details
const listing = await client.getListing('12345');
```

## Files

- `scripts/capture-gratka-api.ts` - Playwright capture script
- `scripts/analyze-gratka-api.ts` - Analysis and client generation
- `captured-gratka-api.json` - Raw captured data (generated)
- `gratka-api-report.md` - Analysis report (generated)
- `scripts/gratka-client-stub.ts` - Client stub (generated)

## Legal Note

Respect the website's terms of service and robots.txt. Use reasonable request rates and don't overload their servers.
