import { defineNitroPlugin } from '#imports';
import { initializeAllMetrics } from '../utils/metrics';
import { scopedLogger } from '../utils/logger';

const log = scopedLogger('metrics-plugin');

// Check if we're in Cloudflare Workers environment
// Cloudflare Workers don't support fs, setInterval, or async I/O in global scope
const isCloudflareWorkers = typeof process === 'undefined' || 
  (typeof navigator !== 'undefined' && typeof caches !== 'undefined');

export default defineNitroPlugin(async () => {
  // Skip metrics initialization in Cloudflare Workers
  if (isCloudflareWorkers) {
    log.info('Skipping metrics initialization (Cloudflare Workers environment)');
    return;
  }

  try {
    log.info('Initializing metrics at startup...');
    await initializeAllMetrics();
    log.info('Metrics initialized.');
  } catch (error) {
    log.error('Failed to initialize metrics at startup', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
