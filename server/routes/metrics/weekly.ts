import { getRegistry } from '../../utils/metrics';
import { scopedLogger } from '../../utils/logger';
import { ensureMetricsInitialized } from '../../utils/metric-init';

const log = scopedLogger('metrics-monthly-endpoint');

export default defineEventHandler(async event => {
  try {
    await ensureMetricsInitialized();

    const weeklyRegistry = getRegistry('weekly');
    const metrics = await weeklyRegistry.metrics();

    event.node.res.setHeader('Content-Type', weeklyRegistry.contentType);
    return metrics;
  } catch (error) {
    log.error('Error in weekly metrics endpoint:', {
      evt: 'metrics_error',
      error: error instanceof Error ? error.message : String(error),
    });
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to collect monthly metrics',
    });
  }
});
