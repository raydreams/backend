import { z } from 'zod';
import { useChallenge } from '~/utils/challenge';
import { query } from '~/utils/prisma';

const startSchema = z.object({
  publicKey: z.string(),
});

export default defineEventHandler(async event => {
  if (event.node.req.method !== 'POST') {
    throw createError({
      statusCode: 405,
      message: 'HTTP method is not allowed. Use POST.',
    });
  }

  const body = await readBody(event);
  const result = startSchema.safeParse(body);

  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Invalid request body',
    });
  }

  /** ─────────────────────────────
   *  Find user by public key
   *  ───────────────────────────── */
  const res = await query(
    `SELECT id FROM users WHERE public_key = $1 LIMIT 1`,
    [body.publicKey]
  );

  if (res.rows.length === 0) {
    throw createError({
      statusCode: 401,
      message: 'User cannot be found',
    });
  }

  /** ─────────────────────────────
   *  Create challenge
   *  ───────────────────────────── */
  const challenge = useChallenge();
  const challengeCode = await challenge.createChallengeCode(
    'login',
    'mnemonic'
  );

  return {
    challenge: challengeCode.code,
  };
});
