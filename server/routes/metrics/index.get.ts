import { register } from 'prom-client';
import { ensureMetricsInitialized } from '../../utils/metric-init';
import { scopedLogger } from '../../utils/logger';

const log = scopedLogger('metrics-endpoint');

export default defineEventHandler(async event => {
  try {
    await ensureMetricsInitialized();

    const metrics = await register.metrics();
    event.node.res.setHeader('Content-Type', register.contentType);
    return metrics;
  } catch (error) {
    log.error('Error in metrics endpoint:', {
      evt: 'metrics_error',
      error: error instanceof Error ? error.message : String(error),
    });
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to collect metrics',
    });
  }
});
