'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, X } from 'lucide-react';

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
}

export default function CitySearch({ onCitySelect }: CitySearchProps) {
  const t = useTranslations('search');
  const locale = useLocale();
  
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchCity = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
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
    } catch (err) {
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
    }, 300);
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative shadow-lg rounded-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={t('placeholder')}
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="pl-9 pr-8 bg-background border-0 shadow-none h-11 text-base"
        />
        {query && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
            onClick={handleClear}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </Button>
        )}
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
          {results.length === 0 && !isLoading && query.length >= 2 && (
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
