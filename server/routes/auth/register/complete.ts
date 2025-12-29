import { z } from 'zod';
import { useChallenge } from '~/utils/challenge';
import { useAuth } from '~/utils/auth';
import { randomUUID } from 'crypto';
import { generateRandomNickname } from '~/utils/nickname';
import { query } from '~/utils/prisma';

const completeSchema = z.object({
  publicKey: z.string(),
  challenge: z.object({
    code: z.string(),
    signature: z.string(),
  }),
  namespace: z.string().min(1),
  device: z.string().max(500).min(1),
  profile: z.object({
    colorA: z.string(),
    colorB: z.string(),
    icon: z.string(),
  }),
});

export default defineEventHandler(async event => {
  if (event.node.req.method !== 'POST') {
    throw createError({
      statusCode: 405,
      message: 'HTTP method is not allowed. Use POST.',
    });
  }

  const body = await readBody(event);
  const parsed = completeSchema.safeParse(body);

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: 'Invalid request body',
    });
  }

  const challenge = useChallenge();
  await challenge.verifyChallengeCode(
    body.challenge.code,
    body.publicKey,
    body.challenge.signature,
    'registration',
    'mnemonic'
  );

  /** ─────────────────────────────
   *  Check for existing user
   *  ───────────────────────────── */
  const existing = await query(
    `SELECT id FROM users WHERE public_key = $1 LIMIT 1`,
    [body.publicKey]
  );

  if (existing.rows.length > 0) {
    throw createError({
      statusCode: 409,
      message: 'A user with this public key already exists',
    });
  }

  /** ─────────────────────────────
   *  Create user
   *  ───────────────────────────── */
  const userId = randomUUID();
  const now = new Date();
  const nickname = generateRandomNickname();

  const insert = await query(
    `
    INSERT INTO users (
      id,
      namespace,
      public_key,
      nickname,
      created_at,
      last_logged_in,
      permissions,
      profile
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
    `,
    [
      userId,
      body.namespace,
      body.publicKey,
      nickname,
      now,
      now,
      JSON.stringify([]),
      JSON.stringify(body.profile),
    ]
  );

  const user = insert.rows[0];

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
      nickname: user.nickname,
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
