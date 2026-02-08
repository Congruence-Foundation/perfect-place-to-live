import type { POIDataSource } from '@/types/poi';

/** Error thrown when POI fetching fails */
export class POIFetchError extends Error {
  constructor(
    message: string,
    public readonly source: POIDataSource,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'POIFetchError';
  }
}
