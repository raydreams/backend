import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { query } from '~/utils/prisma';

function progressIsNotStarted(duration: number, watched: number): boolean {
  return watched < 20;
}

function progressIsCompleted(duration: number, watched: number): boolean {
  return duration - watched < 120; // 2 minutes
}

async function shouldSaveProgress(
  userId: string,
  tmdbId: string,
  validatedBody: any
): Promise<boolean> {
  const duration = parseInt(validatedBody.duration);
  const watched = parseInt(validatedBody.watched);

  const isNotStarted = progressIsNotStarted(duration, watched);
  const isCompleted = progressIsCompleted(duration, watched);
  const isAcceptable = !isNotStarted && !isCompleted;

  if (validatedBody.meta.type === 'movie') return isAcceptable;
  if (isAcceptable) return true;

  if (!validatedBody.seasonId) return false;

  const seasonEpisodes = await query(
    `
    SELECT duration, watched
    FROM progress_items
    WHERE user_id = $1 AND tmdb_id = $2 AND season_id = $3 AND episode_id IS DISTINCT FROM $4
    `,
    [userId, tmdbId, validatedBody.seasonId, validatedBody.episodeId || null]
  );

  return seasonEpisodes.rows.some(
    (episode: any) =>
      !progressIsNotStarted(Number(episode.duration), Number(episode.watched)) &&
      !progressIsCompleted(Number(episode.duration), Number(episode.watched))
  );
}

const progressMetaSchema = z.object({
  title: z.string(),
  year: z.number().optional(),
  poster: z.string().optional(),
  type: z.enum(['movie', 'show']),
});

const progressItemSchema = z.object({
  meta: progressMetaSchema,
  tmdbId: z.string(),
  duration: z.number().transform(n => n.toString()),
  watched: z.number().transform(n => n.toString()),
  seasonId: z.string().optional(),
  episodeId: z.string().optional(),
  seasonNumber: z.number().optional(),
  episodeNumber: z.number().optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
});

const minEpoch = 1626134400000;
function defaultAndCoerceDateTime(dateTime: string | undefined) {
  const epoch = dateTime ? new Date(dateTime).getTime() : Date.now();
  const clampedEpoch = Math.max(minEpoch, Math.min(epoch, Date.now()));
  return new Date(clampedEpoch);
}

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const method = event.method;

  const session = await useAuth().getCurrentSession();
  if (!session) throw createError({ statusCode: 401, message: 'Session not found' });
  if (session.user !== userId)
    throw createError({ statusCode: 403, message: 'Cannot access other user info' });

  // GET all progress items
  if (method === 'GET') {
    const items = await query(
      `
      SELECT *
      FROM progress_items
      WHERE user_id = $1
      ORDER BY updated_at DESC
      `,
      [userId]
    );

    return items.rows.map((item: any) => ({
      id: item.id,
      tmdbId: item.tmdb_id,
      episode: { id: item.episode_id || null, number: item.episode_number || null },
      season: { id: item.season_id || null, number: item.season_number || null },
      meta: item.meta,
      duration: Number(item.duration),
      watched: Number(item.watched),
      updatedAt: item.updated_at,
    }));
  }

  // DELETE cleanup
  if (method === 'DELETE' && event.path.endsWith('/progress/cleanup')) {
    const allItems = await query(`SELECT * FROM progress_items WHERE user_id = $1`, [userId]);

    const itemsToDelete: string[] = [];

    // group by tmdb_id
    const itemsByTmdbId: Record<string, any[]> = {};
    for (const item of allItems.rows) {
      if (!itemsByTmdbId[item.tmdb_id]) itemsByTmdbId[item.tmdb_id] = [];
      itemsByTmdbId[item.tmdb_id].push(item);
    }

    for (const [tmdbId, items] of Object.entries(itemsByTmdbId)) {
      const movieItems = items.filter(item => !item.episode_id);
      const episodeItems = items.filter(item => item.episode_id);

      // movies
      for (const item of movieItems) {
        const duration = Number(item.duration);
        const watched = Number(item.watched);
        if (progressIsNotStarted(duration, watched) || progressIsCompleted(duration, watched)) {
          itemsToDelete.push(item.id);
        }
      }

      // episodes grouped by season
      const episodesBySeason: Record<string, any[]> = {};
      for (const item of episodeItems) {
        const key = `${item.season_id}`;
        if (!episodesBySeason[key]) episodesBySeason[key] = [];
        episodesBySeason[key].push(item);
      }

      for (const seasonItems of Object.values(episodesBySeason)) {
        const hasAcceptable = seasonItems.some(
          (item: any) =>
            !progressIsNotStarted(Number(item.duration), Number(item.watched)) &&
            !progressIsCompleted(Number(item.duration), Number(item.watched))
        );

        if (hasAcceptable) {
          for (const item of seasonItems) {
            const duration = Number(item.duration);
            const watched = Number(item.watched);
            if (progressIsNotStarted(duration, watched) || progressIsCompleted(duration, watched)) {
              itemsToDelete.push(item.id);
            }
          }
        } else {
          itemsToDelete.push(...seasonItems.map(item => item.id));
        }
      }
    }

    if (itemsToDelete.length) {
      await query(
        `
        DELETE FROM progress_items
        WHERE user_id = $1 AND id = ANY($2)
        `,
        [userId, itemsToDelete]
      );
    }

    return { deletedCount: itemsToDelete.length, message: `Cleaned up ${itemsToDelete.length} items` };
  }

  // PUT or DELETE for a single progress item
  if (event.path.includes('/progress/') && !event.path.endsWith('/import') && !event.path.endsWith('/cleanup')) {
    const segments = event.path.split('/');
    const tmdbId = segments[segments.length - 1];

    if (method === 'PUT') {
      const body = await readBody(event);
      const validatedBody = progressItemSchema.parse(body);

      const shouldSave = await shouldSaveProgress(userId, tmdbId, validatedBody);
      const now = defaultAndCoerceDateTime(validatedBody.updatedAt);

      if (!shouldSave) {
        return {
          id: '',
          tmdbId,
          userId,
          seasonId: validatedBody.seasonId,
          episodeId: validatedBody.episodeId,
          seasonNumber: validatedBody.seasonNumber,
          episodeNumber: validatedBody.episodeNumber,
          meta: validatedBody.meta,
          duration: parseInt(validatedBody.duration),
          watched: parseInt(validatedBody.watched),
          updatedAt: now,
        };
      }

      const existingItem = await query(
        `
        SELECT *
        FROM progress_items
        WHERE user_id = $1 AND tmdb_id = $2 AND season_id IS DISTINCT FROM $3 AND episode_id IS DISTINCT FROM $4
        `,
        [userId, tmdbId, validatedBody.seasonId || null, validatedBody.episodeId || null]
      );

      let progressItem;
      if (existingItem.rows.length) {
        const id = existingItem.rows[0].id;
        await query(
          `
          UPDATE progress_items
          SET duration = $1, watched = $2, meta = $3, updated_at = $4
          WHERE id = $5
          `,
          [
            BigInt(validatedBody.duration),
            BigInt(validatedBody.watched),
            validatedBody.meta,
            now,
            id,
          ]
        );
        progressItem = { ...existingItem.rows[0], ...validatedBody, updated_at: now };
      } else {
        const id = randomUUID();
        await query(
          `
          INSERT INTO progress_items (id, user_id, tmdb_id, season_id, episode_id, season_number, episode_number, duration, watched, meta, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          `,
          [
            id,
            userId,
            tmdbId,
            validatedBody.seasonId || null,
            validatedBody.episodeId || null,
            validatedBody.seasonNumber || null,
            validatedBody.episodeNumber || null,
            BigInt(validatedBody.duration),
            BigInt(validatedBody.watched),
            validatedBody.meta,
            now,
          ]
        );
        progressItem = { id, ...validatedBody, updated_at: now };
      }

      return {
        id: progressItem.id,
        tmdbId,
        userId,
        seasonId: progressItem.seasonId,
        episodeId: progressItem.episodeId,
        seasonNumber: progressItem.seasonNumber,
        episodeNumber: progressItem.episodeNumber,
        meta: progressItem.meta,
        duration: parseInt(progressItem.duration),
        watched: parseInt(progressItem.watched),
        updatedAt: progressItem.updated_at,
      };
    }

    if (method === 'DELETE') {
      const body = await readBody(event).catch(() => ({}));
      const conditions: any[] = [userId, tmdbId];
      let whereSQL = 'user_id = $1 AND tmdb_id = $2';
      let paramIndex = 3;

      if (body.seasonId) {
        whereSQL += ` AND season_id = $${paramIndex++}`;
        conditions.push(body.seasonId);
      }
      if (body.episodeId) {
        whereSQL += ` AND episode_id = $${paramIndex++}`;
        conditions.push(body.episodeId);
      }

      const itemsToDelete = await query(`SELECT id FROM progress_items WHERE ${whereSQL}`, conditions);

      if (!itemsToDelete.rows.length) {
        return { count: 0, tmdbId, episodeId: body.episodeId, seasonId: body.seasonId };
      }

      await query(`DELETE FROM progress_items WHERE ${whereSQL}`, conditions);

      return {
        count: itemsToDelete.rows.length,
        tmdbId,
        episodeId: body.episodeId,
        seasonId: body.seasonId,
      };
    }
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
