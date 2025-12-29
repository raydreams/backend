import { query } from '../../../../utils/prisma';
import { useAuth } from '../../../../utils/auth';

export default defineEventHandler(async (event) => {
  const userId = event.context.params?.id;
  const listId = event.context.params?.listId;

  if (!userId || !listId) {
    throw createError({ statusCode: 400, message: 'Missing userId or listId' });
  }

  // Get current session
  const session = await useAuth().getCurrentSession();
  if (session.user !== userId) {
    throw createError({
      statusCode: 403,
      message: 'Cannot delete lists for other users',
    });
  }

  // Fetch the list
  const listResult = await query(
    'SELECT * FROM lists WHERE id = $1',
    [listId]
  );

  if (!listResult.rows.length) {
    throw createError({ statusCode: 404, message: 'List not found' });
  }

  const list = listResult.rows[0];
  if (list.user_id !== userId) {
    throw createError({
      statusCode: 403,
      message: "Cannot delete lists you don't own",
    });
  }

  // Delete list items
  await query('DELETE FROM list_items WHERE list_id = $1', [listId]);
  // Delete the list
  await query('DELETE FROM lists WHERE id = $1', [listId]);

  return {
    id: listId,
    message: 'List deleted successfully',
  };
});
