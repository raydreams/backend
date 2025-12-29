import { useAuth } from '../../../../utils/auth';
import { query } from '../../../../utils/prisma';
import { z } from 'zod';

const listItemSchema = z.object({
  tmdb_id: z.string(),
  type: z.enum(['movie', 'tv']),
});

const updateListSchema = z.object({
  list_id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(255).optional().nullable(),
  public: z.boolean().optional(),
  addItems: z.array(listItemSchema).optional(),
  removeItems: z.array(listItemSchema).optional(),
});

export default defineEventHandler(async (event) => {
  const userId = event.context.params?.id;
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({
      statusCode: 403,
      message: 'Cannot modify lists for other users',
    });
  }

  const body = await readBody(event);
  const validatedBody = updateListSchema.parse(body);

  // Fetch list and items
  const listResult = await query(
    `SELECT l.*, json_agg(li.*) FILTER (WHERE li.id IS NOT NULL) AS list_items
     FROM lists l
     LEFT JOIN list_items li ON li.list_id = l.id
     WHERE l.id = $1 AND l.user_id = $2
     GROUP BY l.id`,
    [validatedBody.list_id, userId]
  );

  if (!listResult.rows.length) {
    throw createError({ statusCode: 404, message: 'List not found' });
  }

  const list = listResult.rows[0];
  const existingItems: { tmdb_id: string; type: string }[] = list.list_items ?? [];

  // Update list metadata
  if (validatedBody.name || validatedBody.description !== undefined || validatedBody.public !== undefined) {
    await query(
      `UPDATE lists
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           public = COALESCE($3, public)
       WHERE id = $4`,
      [validatedBody.name, validatedBody.description, validatedBody.public, list.id]
    );
  }

  // Add new items
  if (validatedBody.addItems?.length) {
    const itemsToAdd = validatedBody.addItems.filter(
      item => !existingItems.some(e => e.tmdb_id === item.tmdb_id)
    );

    for (const item of itemsToAdd) {
      await query(
        `INSERT INTO list_items (list_id, tmdb_id, type)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [list.id, item.tmdb_id, item.type]
      );
    }
  }

  // Remove items
  if (validatedBody.removeItems?.length) {
    const tmdbIdsToRemove = validatedBody.removeItems.map(item => item.tmdb_id);
    await query(
      `DELETE FROM list_items WHERE list_id = $1 AND tmdb_id = ANY($2::text[])`,
      [list.id, tmdbIdsToRemove]
    );
  }

  // Return updated list
  const updatedListResult = await query(
    `SELECT l.*, json_agg(li.*) FILTER (WHERE li.id IS NOT NULL) AS list_items
     FROM lists l
     LEFT JOIN list_items li ON li.list_id = l.id
     WHERE l.id = $1
     GROUP BY l.id`,
    [list.id]
  );

  return {
    list: updatedListResult.rows[0],
    message: 'List updated successfully',
  };
});
