import { z } from 'zod';
import { useChallenge } from '~/utils/challenge';
import { H3Event, createError, readBody } from 'h3';

const startSchema = z.object({
  captchaToken: z.string().optional(),
});

export default defineEventHandler(async (event: H3Event) => {
  const origin = event.req.headers.origin;
  const allowedOrigins = ['https://pstream.mov'];
  if (origin && allowedOrigins.includes(origin)) {
    event.res.setHeader('Access-Control-Allow-Origin', origin);
  }
  event.res.setHeader('Access-Control-Allow-Credentials', 'true');
  event.res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS'
  );
  event.res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );

  if (event.req.method === 'OPTIONS') {
    event.res.statusCode = 204;
    return '';
  }

  if (event.req.method !== 'POST') {
    throw createError({
      statusCode: 405,
      message: 'HTTP method not allowed. Use POST.',
    });
  }

  // Read and validate body
  const body = await readBody(event);
  const result = startSchema.safeParse(body);
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Invalid request body. Make sure to send JSON with { "captchaToken": "..." }',
    });
  }

  try {
    console.log('Starting challenge creation...');
    const challenge = useChallenge();
    const challengeCode = await challenge.createChallengeCode('registration', 'mnemonic');
    console.log('Challenge created:', challengeCode);

    return { challenge: challengeCode.code };
  } catch (err) {
    console.error('register/start error:', err);
    throw createError({
      statusCode: 500,
      message: (err as Error)?.message || 'Server error',
    });
  }
});
