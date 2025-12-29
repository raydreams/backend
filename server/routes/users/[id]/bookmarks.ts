import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { query } from '~/utils/prisma';

const bookmarkMetaSchema = z.object({
  title: z.string(),
  year: z.number().optional(),
  poster: z.string().optional(),
  type: z.enum(['movie', 'show']),
});

const bookmarkDataSchema = z.object({
  tmdbId: z.string(),
  meta: bookmarkMetaSchema,
  group: z.union([z.string(), z.array(z.string())]).optional(),
  favoriteEpisodes: z.array(z.string()).optional(),
});

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const method = event.method;

  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({
      statusCode: 403,
      message: 'Cannot access other user information',
    });
  }

  /* -------------------- GET -------------------- */
  if (method === 'GET') {
    const { rows } = await query(
      `
      SELECT
        tmdb_id,
        meta,
        "group",
        favorite_episodes,
        updated_at
      FROM bookmarks
      WHERE user_id = $1
      ORDER BY updated_at DESC
      `,
      [userId]
    );

    return rows.map(row => ({
      tmdbId: row.tmdb_id,
      meta: row.meta,
      group: row.group,
      favoriteEpisodes: row.favorite_episodes,
      updatedAt: row.updated_at,
    }));
  }

  /* -------------------- PUT -------------------- */
  if (method === 'PUT') {
    const body = await readBody(event);
    const validatedBody = z.array(bookmarkDataSchema).parse(body);

    const now = new Date();
    const results = [];

    for (const item of validatedBody) {
      const normalizedGroup = item.group
        ? Array.isArray(item.group)
          ? item.group
          : [item.group]
        : [];

      const normalizedFavoriteEpisodes = item.favoriteEpisodes ?? [];

      const { rows } = await query(
        `
        INSERT INTO bookmarks (
          tmdb_id,
          user_id,
          meta,
          "group",
          favorite_episodes,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (tmdb_id, user_id)
        DO UPDATE SET
          meta = EXCLUDED.meta,
          "group" = EXCLUDED."group",
          favorite_episodes = EXCLUDED.favorite_episodes,
          updated_at = EXCLUDED.updated_at
        RETURNING
          tmdb_id,
          meta,
          "group",
          favorite_episodes,
          updated_at
        `,
        [
          item.tmdbId,
          userId,
          item.meta,
          normalizedGroup,
          normalizedFavoriteEpisodes,
          now,
        ]
      );

      const bookmark = rows[0];

      results.push({
        tmdbId: bookmark.tmdb_id,
        meta: bookmark.meta,
        group: bookmark.group,
        favoriteEpisodes: bookmark.favorite_episodes,
        updatedAt: bookmark.updated_at,
      });
    }

    return results;
  }

  throw createError({
    statusCode: 405,
    message: 'Method not allowed',
  });
});
