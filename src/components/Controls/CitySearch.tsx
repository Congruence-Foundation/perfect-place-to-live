'use client';

import { useState, useCallback, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, X, LocateFixed } from 'lucide-react';
import { useClickOutside } from '@/hooks';
import { UI_CONFIG } from '@/constants/performance';

const SEARCH_DEBOUNCE_MS = UI_CONFIG.FACTORS_DEBOUNCE_MS;
const MIN_SEARCH_LENGTH = 2;

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

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data: SearchResult[] = await response.json();
      setResults(data);
      setIsOpen(data.length > 0);
    } catch {
      setError(t('failed'));
      setResults([]);
    } finally {
      setIsLoading(false);
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
    const cityName = result.display_name.split(',')[0];
    setQuery(cityName);
    setIsOpen(false);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  const handleLocateMe = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError(t('noGeolocation'));
      return;
    }

    setIsLocating(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        onCitySelect(latitude, longitude);
        setQuery('');
        setIsLocating(false);
      },
      () => {
        setError(t('locationFailed'));
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
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
            }, 150);
          }}
          onKeyDown={handleKeyDown}
          className="pl-8 pr-16 bg-background border-0 shadow-none h-8 text-base rounded-full"
          style={{ fontSize: '16px' }} // Prevent iOS zoom on focus
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {query && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 rounded-full"
              onClick={handleClear}
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
            title={t('locateMe')}
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
        <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
          {results.map((result) => (
            <button
              key={result.place_id}
              className="w-full px-3 py-2.5 text-left hover:bg-muted transition-colors text-sm first:rounded-t-lg last:rounded-b-lg"
              onClick={() => handleSelectResult(result)}
            >
              <div className="font-medium truncate">
                {result.display_name.split(',')[0]}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {result.display_name.split(',').slice(1, 3).join(',')}
              </div>
            </button>
          ))}
          {results.length === 0 && !isLoading && query.length >= MIN_SEARCH_LENGTH && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
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
