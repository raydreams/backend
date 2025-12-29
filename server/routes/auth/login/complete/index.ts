import { z } from 'zod';
import { useChallenge } from '~/utils/challenge';
import { useAuth } from '~/utils/auth';
import { query } from '~/utils/prisma';

const completeSchema = z.object({
  publicKey: z.string(),
  challenge: z.object({
    code: z.string(),
    signature: z.string(),
  }),
  device: z.string().max(500).min(1),
});

export default defineEventHandler(async event => {
  if (event.node.req.method !== 'POST') {
    throw createError({
      statusCode: 405,
      message: 'HTTP method is not allowed. Use POST.',
    });
  }

  const body = await readBody(event);
  const result = completeSchema.safeParse(body);

  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Invalid request body',
    });
  }

  /** ─────────────────────────────
   *  Verify challenge
   *  ───────────────────────────── */
  const challenge = useChallenge();
  await challenge.verifyChallengeCode(
    body.challenge.code,
    body.publicKey,
    body.challenge.signature,
    'login',
    'mnemonic'
  );

  /** ─────────────────────────────
   *  Fetch user by public key
   *  ───────────────────────────── */
  const userRes = await query(
    `
    SELECT
      id,
      public_key,
      namespace,
      profile,
      permissions
    FROM users
    WHERE public_key = $1
    LIMIT 1
    `,
    [body.publicKey]
  );

  if (userRes.rows.length === 0) {
    throw createError({
      statusCode: 401,
      message: 'User cannot be found',
    });
  }

  const user = userRes.rows[0];

  /** ─────────────────────────────
   *  Update last login timestamp
   *  ───────────────────────────── */
  await query(
    `UPDATE users SET last_logged_in = NOW() WHERE id = $1`,
    [user.id]
  );

  /** ─────────────────────────────
   *  Create session
   *  ───────────────────────────── */
  const auth = useAuth();
  const userAgent = getRequestHeader(event, 'user-agent') || '';
  const session = await auth.makeSession(user.id, body.device, userAgent);
  const token = auth.makeSessionToken(session);

  return {
    user: {
      id: user.id,
      publicKey: user.public_key,
      namespace: user.namespace,
      profile: user.profile,
      permissions: user.permissions,
    },
    session: {
      id: session.id,
      user: session.user,
      createdAt: session.created_at,
      accessedAt: session.accessed_at,
      expiresAt: session.expires_at,
      device: session.device,
      userAgent: session.user_agent,
    },
    token,
  };
});
