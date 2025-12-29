import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { query } from '~/utils/prisma';

const groupOrderSchema = z.array(z.string());

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const method = event.method;

  const session = await useAuth().getCurrentSession();
  if (!session) {
    throw createError({ statusCode: 401, message: 'Session not found' });
  }

  if (session.user !== userId) {
    throw createError({
      statusCode: 403,
      message: 'Cannot access other user information',
    });
  }

  if (method === 'GET') {
    const result = await query(
      `SELECT group_order FROM user_group_order WHERE user_id = $1`,
      [userId]
    );

    return {
      groupOrder: result.rows[0]?.group_order || [],
    };
  }

  if (method === 'PUT') {
    const body = await readBody(event);
    const validatedGroupOrder = groupOrderSchema.parse(body);

    // Upsert logic using raw SQL
    const upsertQuery = `
      INSERT INTO user_group_order (user_id, group_order, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id) 
      DO UPDATE SET group_order = $2, updated_at = NOW()
      RETURNING group_order
    `;

    const result = await query(upsertQuery, [userId, validatedGroupOrder]);

    return {
      groupOrder: result.rows[0].group_order,
    };
  }

  throw createError({
    statusCode: 405,
    message: 'Method not allowed',
  });
});
