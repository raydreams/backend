import { z } from 'zod';
import { useChallenge } from '~/utils/challenge';
import { H3Event, createError, readBody } from 'h3';

const startSchema = z.object({
  captchaToken: z.string().optional(),
});

// Only allow your frontend
const allowedOrigins = ['https://pstream.mov'];

export default defineEventHandler(async (event: H3Event) => {
  const origin = event.req.headers.origin;

  // === Always set CORS headers first ===
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

  // Handle preflight
  if (event.req.method === 'OPTIONS') {
    event.res.statusCode = 204;
    return '';
  }

  try {
    // Only POST allowed
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
        message:
          'Invalid request body. Send JSON like { "captchaToken": "..." }',
      });
    }

    // === Initialize challenge safely ===
    console.log('Initializing challenge system...');
    let challenge;
    try {
      challenge = useChallenge();
      console.log('Challenge object:', challenge);
    } catch (err) {
      console.error('useChallenge() failed:', err);
      throw createError({
        statusCode: 500,
        message: 'Failed to initialize challenge system',
      });
    }

    // === Create challenge code safely ===
    let challengeCode;
    try {
      challengeCode = await challenge.createChallengeCode(
        'registration',
        'mnemonic'
      );
      console.log('Challenge created:', challengeCode);
    } catch (err) {
      console.error('createChallengeCode() failed:', err);
      throw createError({
        statusCode: 500,
        message: 'Challenge creation failed',
      });
    }

    // Success response
    return { challenge: challengeCode.code };
  } catch (err) {
    // === Ensure CORS headers on error ===
    if (origin && allowedOrigins.includes(origin)) {
      event.res.setHeader('Access-Control-Allow-Origin', origin);
    }
    event.res.setHeader('Access-Control-Allow-Credentials', 'true');

    console.error('register/start error caught:', err);
    throw createError({
      statusCode: (err as any)?.statusCode || 500,
      message: (err as Error)?.message || 'Server error',
    });
  }
});
