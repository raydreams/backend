import { useAuth } from '~/utils/auth';
import { query } from '~/utils/prisma';

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const method = event.method;

  const session = await useAuth().getCurrentSession();
  if (!session) {
    throw createError({
      statusCode: 401,
      message: 'Session not found or expired',
    });
  }

  if (session.user !== userId) {
    throw createError({
      statusCode: 403,
      message: 'Cannot access other user information',
    });
  }

  if (method === 'GET') {
    const result = await query(
      `
      SELECT *
      FROM watch_history
      WHERE user_id = $1
      ORDER BY watched_at DESC
      `,
      [userId]
    );

    // Use result.rows instead of result
    return result.rows.map(item => ({
      id: item.id,
      tmdbId: item.tmdb_id,
      episode: {
        id: item.episode_id || null,
        number: item.episode_number || null,
      },
      season: {
        id: item.season_id || null,
        number: item.season_number || null,
      },
      meta: item.meta,
      duration: item.duration.toString(),
      watched: item.watched.toString(),
      watchedAt: item.watched_at.toISOString(),
      completed: item.completed,
      updatedAt: item.updated_at.toISOString(),
    }));
  }

  throw createError({
    statusCode: 405,
    message: 'Method not allowed',
  });
});
