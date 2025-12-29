import { useAuth } from '~/utils/auth';
import { query } from '~/utils/prisma';

export default defineEventHandler(async event => {
  const userId = getRouterParam(event, 'id');

  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({
      statusCode: 403,
      message: 'Cannot access sessions for other users',
    });
  }

  const result = await query(
    `
    SELECT *
    FROM sessions
    WHERE "user" = $1
    ORDER BY created_at DESC
    `,
    [userId]
  );

  // Use result.rows instead of Prisma's array
  return result.rows.map(s => ({
    id: s.id,
    userId: s.user,
    createdAt: s.created_at.toISOString(),
    accessedAt: s.accessed_at.toISOString(),
    device: s.device,
    userAgent: s.user_agent,
  }));
});
