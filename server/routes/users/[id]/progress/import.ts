import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { scopedLogger } from '~/utils/logger';
import { query } from '~/utils/prisma';

const log = scopedLogger('progress-import');

const progressMetaSchema = z.object({
  title: z.string(),
  type: z.enum(['movie', 'show']),
  year: z.number().optional(),
  poster: z.string().optional(),
});

const progressItemSchema = z.object({
  meta: progressMetaSchema,
  tmdbId: z.string().transform(val => val || randomUUID()),
  duration: z.number().min(0).transform(n => Math.round(n)),
  watched: z.number().min(0).transform(n => Math.round(n)),
  seasonId: z.string().optional(),
  episodeId: z.string().optional(),
  seasonNumber: z.number().optional(),
  episodeNumber: z.number().optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
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

  const session = await useAuth().getCurrentSession();
  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Cannot modify user other than yourself' });
  }

  if (event.method !== 'PUT') {
    throw createError({ statusCode: 405, message: 'Method not allowed' });
  }

  try {
    const body = await readBody(event);
    const validatedBody = z.array(progressItemSchema).parse(body);

    // Fetch existing items from DB
    const existingItemsRes = await query(
      'SELECT * FROM progress_items WHERE user_id=$1',
      [userId]
    );
    const existingItems = existingItemsRes.rows;

    const newItems = [...validatedBody];
    const itemsToUpsert: any[] = [];

    for (const existingItem of existingItems) {
      const newItemIndex = newItems.findIndex(
        item =>
          item.tmdbId === existingItem.tmdb_id &&
          item.seasonId === (existingItem.season_id === '\n' ? null : existingItem.season_id) &&
          item.episodeId === (existingItem.episode_id === '\n' ? null : existingItem.episode_id)
      );

      if (newItemIndex > -1) {
        const newItem = newItems[newItemIndex];
        if (Number(existingItem.watched) < newItem.watched) {
          const isMovie = newItem.meta.type === 'movie';
          itemsToUpsert.push({
            id: existingItem.id,
            tmdb_id: existingItem.tmdb_id,
            user_id: existingItem.user_id,
            season_id: isMovie ? '\n' : existingItem.season_id,
            episode_id: isMovie ? '\n' : existingItem.episode_id,
            season_number: existingItem.season_number,
            episode_number: existingItem.episode_number,
            duration: BigInt(newItem.duration),
            watched: BigInt(newItem.watched),
            meta: newItem.meta,
            updated_at: defaultAndCoerceDateTime(newItem.updatedAt),
          });
        }
        newItems.splice(newItemIndex, 1);
      }
    }

    // New items to insert
    for (const item of newItems) {
      const isMovie = item.meta.type === 'movie';
      itemsToUpsert.push({
        id: randomUUID(),
        tmdb_id: item.tmdbId,
        user_id: userId,
        season_id: isMovie ? '\n' : item.seasonId || null,
        episode_id: isMovie ? '\n' : item.episodeId || null,
        season_number: isMovie ? null : item.seasonNumber,
        episode_number: isMovie ? null : item.episodeNumber,
        duration: BigInt(item.duration),
        watched: BigInt(item.watched),
        meta: item.meta,
        updated_at: defaultAndCoerceDateTime(item.updatedAt),
      });
    }

    const results = [];
    for (const item of itemsToUpsert) {
      try {
        // Upsert logic using raw query
        const existingRes = await query(
          `SELECT id FROM progress_items 
           WHERE tmdb_id=$1 AND user_id=$2 AND COALESCE(season_id,'')=$3 AND COALESCE(episode_id,'')=$4`,
          [item.tmdb_id, item.user_id, item.season_id || '', item.episode_id || '']
        );

        let row;
        if (existingRes.rowCount > 0) {
          const updateRes = await query(
            `UPDATE progress_items 
             SET duration=$1, watched=$2, meta=$3::jsonb, updated_at=$4
             WHERE id=$5 RETURNING *`,
            [item.duration, item.watched, JSON.stringify(item.meta), item.updated_at.toISOString(), existingRes.rows[0].id]
          );
          row = updateRes.rows[0];
        } else {
          const insertRes = await query(
            `INSERT INTO progress_items
             (id, tmdb_id, user_id, season_id, episode_id, season_number, episode_number, duration, watched, meta, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
             RETURNING *`,
            [
              item.id,
              item.tmdb_id,
              item.user_id,
              item.season_id,
              item.episode_id,
              item.season_number,
              item.episode_number,
              item.duration,
              item.watched,
              JSON.stringify(item.meta),
              item.updated_at.toISOString(),
            ]
          );
          row = insertRes.rows[0];
        }

        results.push({
          id: row.id,
          tmdbId: row.tmdb_id,
          episode: { id: row.episode_id === '\n' ? null : row.episode_id, number: row.episode_number },
          season: { id: row.season_id === '\n' ? null : row.season_id, number: row.season_number },
          meta: row.meta,
          duration: row.duration.toString(),
          watched: row.watched.toString(),
          updatedAt: new Date(row.updated_at).toISOString(),
        });
      } catch (error) {
        log.error('Failed to upsert progress item', {
          userId,
          tmdbId: item.tmdb_id,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    return results;
  } catch (error) {
    log.error('Failed to import progress', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof z.ZodError) {
      throw createError({ statusCode: 400, message: 'Invalid progress data', cause: error.errors });
    }

    throw createError({
      statusCode: 500,
      message: 'Failed to import progress',
      cause: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
