import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { scopedLogger } from '~/utils/logger';
import { query } from '~/utils/prisma';

const log = scopedLogger('user-bookmarks');

const bookmarkMetaSchema = z.object({
  title: z.string(),
  year: z.number(),
  poster: z.string().optional(),
  type: z.enum(['movie', 'show']),
});

const bookmarkRequestSchema = z.object({
  meta: bookmarkMetaSchema.optional(),
  tmdbId: z.string().optional(),
  group: z.union([z.string(), z.array(z.string())]).optional(),
  favoriteEpisodes: z.array(z.string()).optional(),
});

export default defineEventHandler(async event => {
  const userId = getRouterParam(event, 'id');
  const tmdbId = getRouterParam(event, 'tmdbid');
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Cannot access bookmarks for other users' });
  }

  if (event.method === 'POST') {
    const body = await readBody(event);
    log.info('Creating bookmark', { userId, tmdbId, body });

    const validated = bookmarkRequestSchema.parse(body);
    const meta = bookmarkMetaSchema.parse(validated.meta || body);
    const group = validated.group ? (Array.isArray(validated.group) ? validated.group : [validated.group]) : [];
    const favoriteEpisodes = validated.favoriteEpisodes || [];

    try {
      // Try to find existing bookmark
      const existingRes = await query(
        `SELECT * FROM bookmarks WHERE tmdb_id=$1 AND user_id=$2`,
        [tmdbId, session.user]
      );

      if (existingRes.rowCount > 0) {
        // Update existing
        const updatedRes = await query(
          `UPDATE bookmarks 
           SET meta=$1::jsonb, group=$2::text[], favorite_episodes=$3::text[], updated_at=NOW() 
           WHERE tmdb_id=$4 AND user_id=$5 RETURNING *`,
          [JSON.stringify(meta), group, favoriteEpisodes, tmdbId, session.user]
        );
        const bookmark = updatedRes.rows[0];
        log.info('Bookmark updated successfully', { userId, tmdbId });
        return {
          tmdbId: bookmark.tmdb_id,
          meta: bookmark.meta,
          group: bookmark.group,
          favoriteEpisodes: bookmark.favorite_episodes,
          updatedAt: bookmark.updated_at,
        };
      } else {
        // Create new
        const createdRes = await query(
          `INSERT INTO bookmarks (id, user_id, tmdb_id, meta, group, favorite_episodes, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3::jsonb, $4::text[], $5::text[], NOW()) RETURNING *`,
          [session.user, tmdbId, JSON.stringify(meta), group, favoriteEpisodes]
        );
        const bookmark = createdRes.rows[0];
        log.info('Bookmark created successfully', { userId, tmdbId });
        return {
          tmdbId: bookmark.tmdb_id,
          meta: bookmark.meta,
          group: bookmark.group,
          favoriteEpisodes: bookmark.favorite_episodes,
          updatedAt: bookmark.updated_at,
        };
      }
    } catch (error) {
      log.error('Failed to upsert bookmark', { userId, tmdbId, error: error instanceof Error ? error.message : String(error) });
      if (error instanceof z.ZodError) throw createError({ statusCode: 400, message: JSON.stringify(error.errors, null, 2) });
      throw createError({ statusCode: 500, message: 'Failed to upsert bookmark', cause: error instanceof Error ? error.message : String(error) });
    }
  }

  if (event.method === 'DELETE') {
    log.info('Deleting bookmark', { userId, tmdbId });
    try {
      await query(
        `DELETE FROM bookmarks WHERE tmdb_id=$1 AND user_id=$2`,
        [tmdbId, session.user]
      );
      log.info('Bookmark deleted successfully', { userId, tmdbId });
      return { success: true, tmdbId };
    } catch (error) {
      log.error('Failed to delete bookmark', { userId, tmdbId, error: error instanceof Error ? error.message : String(error) });
      throw createError({ statusCode: 500, message: 'Failed to delete bookmark', cause: error instanceof Error ? error.message : String(error) });
    }
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
