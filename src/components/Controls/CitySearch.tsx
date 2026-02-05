'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, X, LocateFixed } from 'lucide-react';
import { useClickOutside } from '@/hooks';
import { UI_CONFIG } from '@/constants/performance';

const SEARCH_DEBOUNCE_MS = UI_CONFIG.FACTORS_DEBOUNCE_MS;
const MIN_SEARCH_LENGTH = 2;
const BLUR_FOCUS_DELAY_MS = 150;
// Use centralized geolocation constants from UI_CONFIG
const { GEOLOCATION_TIMEOUT_MS, GEOLOCATION_MAX_AGE_MS } = UI_CONFIG;

/** Extract the primary city/place name from a Nominatim display_name */
function extractCityName(displayName: string): string {
  return displayName.split(',')[0];
}

/** Extract secondary location info (region/country) from a Nominatim display_name */
function extractLocationContext(displayName: string): string {
  return displayName.split(',').slice(1, 3).join(',');
}

interface SearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string]; // [south, north, west, east]
  type: string;
  importance: number;
}

interface CitySearchProps {
  onCitySelect: (lat: number, lng: number, bounds?: { north: number; south: number; east: number; west: number }) => void;
  isMobile?: boolean;
}

export default function CitySearch({ onCitySelect, isMobile = false }: CitySearchProps) {
  const t = useTranslations('search');
  const locale = useLocale();
  
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  // Track the latest search request to prevent stale results from overwriting newer ones
  const searchRequestIdRef = useRef(0);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Close dropdown when clicking outside
  useClickOutside(containerRef, () => {
    setIsOpen(false);
    setIsFocused(false);
  });

  const searchCity = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < MIN_SEARCH_LENGTH) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    // Increment request ID to track this specific request
    const requestId = ++searchRequestIdRef.current;

    try {
      // Use Nominatim API for geocoding (free, OSM-based)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        new URLSearchParams({
          q: searchQuery,
          format: 'json',
          addressdetails: '1',
          limit: '5',
          // Search worldwide
        }),
        {
          headers: {
            'Accept-Language': locale,
          },
        }
      );

      // Check if this is still the latest request (prevent stale results)
      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data: SearchResult[] = await response.json();
      setResults(data);
      setIsOpen(data.length > 0);
    } catch {
      // Only update error state if this is still the latest request
      if (requestId === searchRequestIdRef.current) {
        setError(t('failed'));
        setResults([]);
      }
    } finally {
      // Only update loading state if this is still the latest request
      if (requestId === searchRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [locale, t]);

  const handleInputChange = (value: string) => {
    setQuery(value);

    // Debounce search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchCity(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleSelectResult = (result: SearchResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    
    // Parse bounding box if available
    let bounds: { north: number; south: number; east: number; west: number } | undefined;
    if (result.boundingbox) {
      bounds = {
        south: parseFloat(result.boundingbox[0]),
        north: parseFloat(result.boundingbox[1]),
        west: parseFloat(result.boundingbox[2]),
        east: parseFloat(result.boundingbox[3]),
      };
    }

    onCitySelect(lat, lng, bounds);
    
    // Update input with selected city name (just the city part)
    setQuery(extractCityName(result.display_name));
    setIsOpen(false);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleLocateMe = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError(t('noGeolocation'));
      return;
    }

    setIsLocating(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Guard against state updates after unmount
        if (!isMountedRef.current) return;
        const { latitude, longitude } = position.coords;
        onCitySelect(latitude, longitude);
        setQuery('');
        setIsLocating(false);
      },
      () => {
        // Guard against state updates after unmount
        if (!isMountedRef.current) return;
        setError(t('locationFailed'));
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: GEOLOCATION_TIMEOUT_MS,
        maximumAge: GEOLOCATION_MAX_AGE_MS,
      }
    );
  }, [onCitySelect, t]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div 
      ref={containerRef} 
      className={`relative transition-[width] duration-300 ${
        isMobile 
          ? 'w-full' 
          : isFocused ? 'w-72' : 'w-52'
      }`}
    >
      <div className="relative shadow-lg rounded-full flex items-center">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          type="text"
          placeholder={t('placeholder')}
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => {
            setIsFocused(true);
            if (results.length > 0) setIsOpen(true);
          }}
          onBlur={() => {
            // Delay to allow click on results
            setTimeout(() => {
              if (!containerRef.current?.contains(document.activeElement)) {
                setIsFocused(false);
              }
            }, BLUR_FOCUS_DELAY_MS);
          }}
          onKeyDown={handleKeyDown}
          className="pl-8 pr-16 bg-background border-0 shadow-none h-8 text-base rounded-full"
          style={{ fontSize: '16px' }} // Prevent iOS zoom on focus
          aria-label={t('placeholder')}
          aria-expanded={isOpen}
          aria-controls={isOpen ? 'city-search-results' : undefined}
          aria-autocomplete="list"
          role="combobox"
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {query && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 rounded-full"
              onClick={handleClear}
              aria-label={isLoading ? t('loading') : t('clear')}
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <X className="h-3 w-3" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 rounded-full text-muted-foreground hover:text-foreground"
            onClick={handleLocateMe}
            disabled={isLocating}
            aria-label={t('locateMe')}
          >
            {isLocating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LocateFixed className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Results dropdown */}
      {isOpen && (
        <div 
          id="city-search-results"
          role="listbox"
          aria-label={t('placeholder')}
          className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto"
        >
          {results.map((result) => (
            <button
              key={result.place_id}
              role="option"
              aria-selected={false}
              className="w-full px-3 py-2.5 text-left hover:bg-muted transition-colors text-sm first:rounded-t-lg last:rounded-b-lg"
              onClick={() => handleSelectResult(result)}
            >
              <div className="font-medium truncate">
                {extractCityName(result.display_name)}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {extractLocationContext(result.display_name)}
              </div>
            </button>
          ))}
          {results.length === 0 && !isLoading && query.length >= MIN_SEARCH_LENGTH && (
            <div className="px-3 py-2 text-sm text-muted-foreground" role="status">
              {t('noResults')}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="absolute top-full left-0 right-0 mt-1 text-xs text-destructive bg-background/90 px-3 py-1 rounded">
          {error}
        </div>
      )}
    </div>
  );
}
