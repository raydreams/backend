import { z } from 'zod';
import { recordProviderMetrics } from '~/utils/metrics';
import { scopedLogger } from '~/utils/logger';
import { ensureMetricsInitialized } from '../../utils/metric-init';

const log = scopedLogger('metrics-providers');

const metricsProviderSchema = z.object({
  tmdbId: z.string(),
  type: z.string(),
  title: z.string(),
  seasonId: z.string().optional(),
  episodeId: z.string().optional(),
  status: z.string(),
  providerId: z.string(),
  embedId: z.string().optional(),
  errorMessage: z.string().optional(),
  fullError: z.string().optional(),
});

const metricsProviderInputSchema = z.object({
  items: z.array(metricsProviderSchema).max(10).min(1),
  tool: z.string().optional(),
  batchId: z.string().optional(),
});

export default defineEventHandler(async event => {
  if (event.method !== 'POST' && event.method !== 'PUT') {
    throw createError({ statusCode: 405, message: 'Method not allowed' });
  }

  try {
    await ensureMetricsInitialized();

    const body = await readBody(event);
    const validatedBody = metricsProviderInputSchema.parse(body);

    const hostname = event.node.req.headers.origin?.slice(0, 255) ?? '<UNKNOWN>';
    recordProviderMetrics(validatedBody.items, hostname, validatedBody.tool);

    return true;
  } catch (error) {
    log.error('Failed to process metrics', {
      evt: 'metrics_error',
      error: error instanceof Error ? error.message : String(error),
    });
    throw createError({
      statusCode: error instanceof Error && error.message === 'metrics not initialized' ? 503 : 400,
      message: error instanceof Error ? error.message : 'Failed to process metrics',
    });
  }
});
