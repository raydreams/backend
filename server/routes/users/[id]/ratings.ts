import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { query } from '~/utils/prisma';

const userRatingsSchema = z.object({
  tmdb_id: z.number(),
  type: z.enum(['movie', 'tv']),
  rating: z.number().min(0).max(10),
});

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;

  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({
      statusCode: 403,
      message: 'Permission denied',
    });
  }

  if (event.method === 'GET') {
    const result = await query(
      `
      SELECT ratings
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

    const ratings = result.rows[0]?.ratings || [];

    return {
      userId,
      ratings,
    };
  } else if (event.method === 'POST') {
    const body = await readBody(event);
    const validatedBody = userRatingsSchema.parse(body);

    // Fetch current ratings
    const fetchResult = await query(
      `
      SELECT ratings
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

    const currentRatings = fetchResult.rows[0]?.ratings || [];
    const updatedRatings = [...currentRatings];
    const existingIndex = updatedRatings.findIndex(
      (r: any) => r.tmdb_id === validatedBody.tmdb_id && r.type === validatedBody.type
    );

    if (existingIndex >= 0) {
      updatedRatings[existingIndex] = validatedBody;
    } else {
      updatedRatings.push(validatedBody);
    }

    // Update the user ratings
    await query(
      `
      UPDATE users
      SET ratings = $1
      WHERE id = $2
      `,
      [updatedRatings, userId]
    );

    return {
      userId,
      rating: validatedBody,
    };
  }

  throw createError({
    statusCode: 405,
    message: 'Method not allowed',
  });
});
