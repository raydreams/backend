import { defineNitroPlugin } from '#imports';
import { initializeAllMetrics } from '../utils/metrics';
import { scopedLogger } from '../utils/logger';

const log = scopedLogger('metrics-plugin');

// Track whether metrics have been initialized
let metricsInitialized = false;

// Cloudflare-safe async initializer
export async function ensureMetricsInitialized() {
  if (metricsInitialized) return;
  try {
    log.info('Initializing metrics...');
    await initializeAllMetrics();
    metricsInitialized = true;
    log.info('Metrics initialized.');
  } catch (error) {
    log.error('Failed to initialize metrics', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export default defineNitroPlugin(() => {
  // Skip initialization in Cloudflare environments at plugin load
  if (
    import.meta.preset === 'cloudflare-module' ||
    import.meta.preset === 'cloudflare-pages' ||
    import.meta.preset === 'cloudflare'
  ) {
    log.info('Skipping metrics initialization at startup (Cloudflare environment)');
    return;
  }

  // In Node environments, we can initialize metrics immediately
  ensureMetricsInitialized();
});
