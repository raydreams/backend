import { useAuth } from '~/utils/auth';
import { query } from '~/utils/prisma';

export default defineEventHandler(async event => {
  const session = await useAuth().getCurrentSession();

  if (!session) {
    throw createError({
      statusCode: 401,
      message: 'Session not found or expired',
    });
  }

  const users = await query(
    `
      SELECT
        id,
        public_key,
        namespace,
        nickname,
        profile,
        permissions
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [session.user]
  );

  const user = users[0];

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found',
    });
  }

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
  };
});
