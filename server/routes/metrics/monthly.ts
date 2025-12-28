import { getRegistry } from '../../utils/metrics';
import { scopedLogger } from '../../utils/logger';
import { ensureMetricsInitialized } from '../../utils/metric-init';

const log = scopedLogger('metrics-monthly-endpoint');

export default defineEventHandler(async event => {
  try {
    await ensureMetricsInitialized();

    const monthlyRegistry = getRegistry('monthly');
    const metrics = await monthlyRegistry.metrics();

    event.node.res.setHeader('Content-Type', monthlyRegistry.contentType);
    return metrics;
  } catch (error) {
    log.error('Error in monthly metrics endpoint:', {
      evt: 'metrics_error',
      error: error instanceof Error ? error.message : String(error),
    });
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to collect monthly metrics',
    });
  }
});
