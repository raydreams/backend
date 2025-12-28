import { defineNitroPlugin } from '#imports';
import { scopedLogger } from '../utils/logger';
import { ensureMetricsInitialized } from '../utils/metric-init';

const log = scopedLogger('metrics-plugin');

export default defineNitroPlugin(() => {
  // Skip initialization in Cloudflare environments
  if (
    import.meta.preset === 'cloudflare-module' ||
    import.meta.preset === 'cloudflare-pages' ||
    import.meta.preset === 'cloudflare'
  ) {
    log.info('Skipping metrics initialization at startup (Cloudflare environment)');
    return;
  }

  // In Node.js, safely initialize metrics at startup
  ensureMetricsInitialized().catch(error => {
    log.error('Failed to initialize metrics at startup', {
      error: error instanceof Error ? error.message : String(error),
    });
  });
});
