import { z } from 'zod';
import { useChallenge } from '~/utils/challenge';
import { H3Event, readBody } from 'h3';

const startSchema = z.object({
  captchaToken: z.string().optional(),
});

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
    if (event.req.method !== 'POST') {
      event.res.statusCode = 405;
      return { error: true, message: 'HTTP method not allowed. Use POST.' };
    }

    const body = await readBody(event);
    const result = startSchema.safeParse(body);
    if (!result.success) {
      event.res.statusCode = 400;
      return {
        error: true,
        message:
          'Invalid request body. Send JSON like { "captchaToken": "..." }',
      };
    }

    // Initialize challenge
    let challenge;
    try {
      console.log('Initializing challenge system...');
      challenge = useChallenge();
      console.log('Challenge object:', challenge);
    } catch (err) {
      console.error('useChallenge() failed:', err);
      event.res.statusCode = 500;
      return { error: true, message: 'Failed to initialize challenge system' };
    }

    // Create challenge code
    let challengeCode;
    try {
      challengeCode = await challenge.createChallengeCode(
        'registration',
        'mnemonic'
      );
      console.log('Challenge created:', challengeCode);
    } catch (err) {
      console.error('createChallengeCode() failed:', err);
      event.res.statusCode = 500;
      return { error: true, message: 'Challenge creation failed' };
    }

    // Success
    return { challenge: challengeCode.code };
  } catch (err) {
    console.error('Unhandled register/start error:', err);
    event.res.statusCode = 500;
    return { error: true, message: 'Server error' };
  }
});
