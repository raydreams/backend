import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { query } from '~/utils/prisma';

const progressMetaSchema = z.object({
  title: z.string(),
  poster: z.string().optional(),
  type: z.enum(['movie', 'tv', 'show']),
  year: z.number().optional(),
});

const progressItemSchema = z.object({
  meta: progressMetaSchema,
  tmdbId: z.string(),
  duration: z.number().transform(Math.round),
  watched: z.number().transform(Math.round),
  seasonId: z.string().optional(),
  episodeId: z.string().optional(),
  seasonNumber: z.number().optional(),
  episodeNumber: z.number().optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
});

const minEpoch = 1626134400000;

const coerceDateTime = (dateTime?: string) => {
  const epoch = dateTime ? new Date(dateTime).getTime() : Date.now();
  return new Date(Math.max(minEpoch, Math.min(epoch, Date.now())));
};

const normalizeIds = (metaType: string, seasonId?: string, episodeId?: string) => ({
  seasonId: metaType === 'movie' ? '\n' : seasonId || null,
  episodeId: metaType === 'movie' ? '\n' : episodeId || null,
});

export default defineEventHandler(async (event) => {
  const { id: userId, tmdb_id: tmdbId } = event.context.params!;
  const method = event.method;

  const session = await useAuth().getCurrentSession();
  if (session.user !== userId) throw createError({ statusCode: 403, message: 'Unauthorized' });

  if (method === 'PUT') {
    const body = await readBody(event);
    const parsedBody = progressItemSchema.parse(body);
    const { meta, duration, watched, seasonId, episodeId, seasonNumber, episodeNumber, updatedAt } = parsedBody;

    const now = coerceDateTime(updatedAt);
    const { seasonId: normSeasonId, episodeId: normEpisodeId } = normalizeIds(meta.type, seasonId, episodeId);

    const existingRes = await query(
      `SELECT * FROM progress_items WHERE tmdb_id=$1 AND user_id=$2 AND COALESCE(season_id,'')=$3 AND COALESCE(episode_id,'')=$4`,
      [tmdbId, userId, normSeasonId || '', normEpisodeId || '']
    );
    const existing = existingRes.rows[0];

    const data = {
      duration,
      watched,
      meta: JSON.stringify(meta),
      updated_at: now.toISOString(),
    };

    let row;
    if (existing) {
      const updateRes = await query(
        `UPDATE progress_items SET duration=$1, watched=$2, meta=$3::jsonb, updated_at=$4 WHERE id=$5 RETURNING *`,
        [BigInt(duration), BigInt(watched), JSON.stringify(meta), now.toISOString(), existing.id]
      );
      row = updateRes.rows[0];
    } else {
      const id = randomUUID();
      const insertRes = await query(
        `INSERT INTO progress_items
         (id, tmdb_id, user_id, season_id, episode_id, season_number, episode_number, duration, watched, meta, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) RETURNING *`,
        [id, tmdbId, userId, normSeasonId, normEpisodeId, seasonNumber || null, episodeNumber || null, BigInt(duration), BigInt(watched), JSON.stringify(meta), now.toISOString()]
      );
      row = insertRes.rows[0];
    }

    return {
      id: row.id,
      tmdbId: row.tmdb_id,
      userId: row.user_id,
      seasonId: row.season_id === '\n' ? null : row.season_id,
      episodeId: row.episode_id === '\n' ? null : row.episode_id,
      seasonNumber: row.season_number,
      episodeNumber: row.episode_number,
      meta: row.meta,
      duration: Number(row.duration),
      watched: Number(row.watched),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  if (method === 'DELETE') {
    const body = await readBody(event).catch(() => ({}));
    let seasonIdVal = body.seasonId;
    let episodeIdVal = body.episodeId;

    if (body.meta?.type === 'movie') {
      seasonIdVal = '\n';
      episodeIdVal = '\n';
    }

    const itemsRes = await query(
      `SELECT * FROM progress_items WHERE user_id=$1 AND tmdb_id=$2 AND ($3 IS NULL OR season_id=$3) AND ($4 IS NULL OR episode_id=$4)`,
      [userId, tmdbId, seasonIdVal, episodeIdVal]
    );

    if (itemsRes.rowCount === 0) return { count: 0, tmdbId, episodeId: episodeIdVal, seasonId: seasonIdVal };

    await query(
      `DELETE FROM progress_items WHERE user_id=$1 AND tmdb_id=$2 AND ($3 IS NULL OR season_id=$3) AND ($4 IS NULL OR episode_id=$4)`,
      [userId, tmdbId, seasonIdVal, episodeIdVal]
    );

    return { count: itemsRes.rowCount, tmdbId, episodeId: episodeIdVal, seasonId: seasonIdVal };
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
