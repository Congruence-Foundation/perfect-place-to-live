import packageJson from '../../package.json';

/**
 * Application configuration
 */
export const APP_CONFIG = {
  /** Current application version (from package.json) */
  VERSION: packageJson.version,
} as const;
