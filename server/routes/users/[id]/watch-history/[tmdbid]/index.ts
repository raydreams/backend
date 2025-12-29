import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { query } from '~/utils/prisma';

const watchHistoryMetaSchema = z.object({
  title: z.string(),
  year: z.number().optional(),
  poster: z.string().optional(),
  type: z.enum(['movie', 'show']),
});

const watchHistoryItemSchema = z.object({
  meta: watchHistoryMetaSchema,
  tmdbId: z.string(),
  duration: z.number().transform(n => n.toString()),
  watched: z.number().transform(n => n.toString()),
  watchedAt: z.string().datetime({ offset: true }),
  completed: z.boolean().optional().default(false),
  seasonId: z.string().optional(),
  episodeId: z.string().optional(),
  seasonNumber: z.number().optional(),
  episodeNumber: z.number().optional(),
});

// 13th July 2021 - movie-web epoch
const minEpoch = 1626134400000;
function defaultAndCoerceDateTime(dateTime: string | undefined) {
  const epoch = dateTime ? new Date(dateTime).getTime() : Date.now();
  const clampedEpoch = Math.max(minEpoch, Math.min(epoch, Date.now()));
  return new Date(clampedEpoch);
}

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const tmdbId = event.context.params?.tmdbid;
  const method = event.method;

  const session = await useAuth().getCurrentSession();
  if (!session) {
    throw createError({ statusCode: 401, message: 'Session not found or expired' });
  }

  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Cannot access other user information' });
  }

  if (method === 'PUT') {
    const body = await readBody(event);
    const validatedBody = watchHistoryItemSchema.parse(body);
    const watchedAt = defaultAndCoerceDateTime(validatedBody.watchedAt);
    const now = new Date();

    // Check if item exists
    const existingItemRes = await query(
      `SELECT id FROM watch_history 
       WHERE tmdb_id=$1 AND user_id=$2 AND COALESCE(season_id,'')=$3 AND COALESCE(episode_id,'')=$4`,
      [tmdbId, userId, validatedBody.seasonId || '', validatedBody.episodeId || '']
    );

    let watchHistoryItem;
    if (existingItemRes.rowCount > 0) {
      // Update
      const id = existingItemRes.rows[0].id;
      const updated = await query(
        `UPDATE watch_history SET duration=$1, watched=$2, watched_at=$3, completed=$4, meta=$5::jsonb, updated_at=$6
         WHERE id=$7 RETURNING *`,
        [
          validatedBody.duration,
          validatedBody.watched,
          watchedAt.toISOString(),
          validatedBody.completed,
          JSON.stringify(validatedBody.meta),
          now.toISOString(),
          id,
        ]
      );
      watchHistoryItem = updated.rows[0];
    } else {
      // Create
      const id = randomUUID();
      const created = await query(
        `INSERT INTO watch_history 
         (id, tmdb_id, user_id, season_id, episode_id, season_number, episode_number, duration, watched, watched_at, completed, meta, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
         RETURNING *`,
        [
          id,
          tmdbId,
          userId,
          validatedBody.seasonId || null,
          validatedBody.episodeId || null,
          validatedBody.seasonNumber || null,
          validatedBody.episodeNumber || null,
          validatedBody.duration,
          validatedBody.watched,
          watchedAt.toISOString(),
          validatedBody.completed,
          JSON.stringify(validatedBody.meta),
          now.toISOString(),
        ]
      );
      watchHistoryItem = created.rows[0];
    }

    return {
      success: true,
      id: watchHistoryItem.id,
      tmdbId: watchHistoryItem.tmdb_id,
      userId: watchHistoryItem.user_id,
      seasonId: watchHistoryItem.season_id,
      episodeId: watchHistoryItem.episode_id,
      seasonNumber: watchHistoryItem.season_number,
      episodeNumber: watchHistoryItem.episode_number,
      meta: watchHistoryItem.meta,
      duration: Number(watchHistoryItem.duration),
      watched: Number(watchHistoryItem.watched),
      watchedAt: new Date(watchHistoryItem.watched_at).toISOString(),
      completed: watchHistoryItem.completed,
      updatedAt: new Date(watchHistoryItem.updated_at).toISOString(),
    };
  }

  if (method === 'DELETE') {
    const body = await readBody(event).catch(() => ({}));

    const whereClause: string[] = ['user_id=$1', 'tmdb_id=$2'];
    const values: any[] = [userId, tmdbId];
    if (body.seasonId) {
      values.push(body.seasonId);
      whereClause.push(`season_id=$${values.length}`);
    }
    if (body.episodeId) {
      values.push(body.episodeId);
      whereClause.push(`episode_id=$${values.length}`);
    }

    const itemsToDeleteRes = await query(
      `SELECT id FROM watch_history WHERE ${whereClause.join(' AND ')}`,
      values
    );

    if (itemsToDeleteRes.rowCount === 0) {
      return { success: true, count: 0, tmdbId, episodeId: body.episodeId, seasonId: body.seasonId };
    }

    const deleteRes = await query(
      `DELETE FROM watch_history WHERE ${whereClause.join(' AND ')}`,
      values
    );

    return {
      success: true,
      count: itemsToDeleteRes.rowCount,
      tmdbId,
      episodeId: body.episodeId,
      seasonId: body.seasonId,
    };
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
