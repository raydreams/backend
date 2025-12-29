import { query } from '../../utils/prisma';

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id;
  if (!id) {
    throw createError({ statusCode: 400, message: 'Missing list ID' });
  }

  // Fetch the list and its items
  const listResult = await query(
    `SELECT l.*, li.id AS item_id, li.name AS item_name
     FROM lists l
     LEFT JOIN list_items li ON li.list_id = l.id
     WHERE l.id = $1`,
    [id]
  );

  if (!listResult.rows.length) {
    throw createError({ statusCode: 404, message: 'List not found' });
  }

  // Build a structured response
  const listRow = listResult.rows[0];
  if (!listRow.public) {
    throw createError({ statusCode: 403, message: 'List is not public' });
  }

  // Collect items
  const items = listResult.rows
    .filter(r => r.item_id)
    .map(r => ({
      id: r.item_id,
      name: r.item_name,
    }));

  return {
    id: listRow.id,
    name: listRow.name,
    public: listRow.public,
    list_items: items,
  };
});
