import { query } from '../../../../utils/prisma';
import { useAuth } from '../../../../utils/auth';

export default defineEventHandler(async (event) => {
  const userId = event.context.params?.id;
  if (!userId) {
    throw createError({ statusCode: 400, message: 'Missing userId' });
  }

  // Get current session
  const session = await useAuth().getCurrentSession();
  if (session.user !== userId) {
    throw createError({
      statusCode: 403,
      message: 'Cannot access other user information',
    });
  }

  // Fetch all lists for this user
  const listsResult = await query(
    `SELECT l.*, 
            json_agg(li.*) FILTER (WHERE li.id IS NOT NULL) AS list_items
     FROM lists l
     LEFT JOIN list_items li ON li.list_id = l.id
     WHERE l.user_id = $1
     GROUP BY l.id`,
    [userId]
  );

  return {
    lists: listsResult.rows,
  };
});
