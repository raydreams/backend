import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { scopedLogger } from '~/utils/logger';
import { query } from '~/utils/prisma';

const log = scopedLogger('user-profile');

const userProfileSchema = z.object({
  profile: z
    .object({
      icon: z.string(),
      colorA: z.string(),
      colorB: z.string(),
    })
    .optional(),
  nickname: z.string().min(1).max(255).optional(),
});

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;

  const session = await useAuth().getCurrentSession();
  if (session.user !== userId) {
    throw createError({
      statusCode: 403,
      message: 'Cannot modify other users',
    });
  }

  if (event.method === 'PATCH') {
    try {
      const body = await readBody(event);
      log.info('Updating user profile', { userId, body });

      const validatedBody = userProfileSchema.parse(body);

      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (validatedBody.profile) {
        updates.push(`profile = $${idx++}`);
        values.push(validatedBody.profile);
      }
      if (validatedBody.nickname !== undefined) {
        updates.push(`nickname = $${idx++}`);
        values.push(validatedBody.nickname);
      }

      if (updates.length === 0) {
        return { message: 'Nothing to update' };
      }

      values.push(userId);

      const updatedUser = await query(
        `
        UPDATE users
        SET ${updates.join(', ')}
        WHERE id = $${idx}
        RETURNING id, public_key, namespace, nickname, profile, permissions, created_at, last_logged_in
        `,
        values
      );

      log.info('User profile updated successfully', { userId });

      return updatedUser.rows[0];
    } catch (error) {
      log.error('Failed to update user profile', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof z.ZodError) {
        throw createError({
          statusCode: 400,
          message: 'Invalid profile data',
          cause: error.errors,
        });
      }

      throw createError({
        statusCode: 500,
        message: 'Failed to update user profile',
        cause: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  if (event.method === 'DELETE') {
    try {
      log.info('Deleting user account', { userId });

      // Delete related records in order
      await query(`DELETE FROM bookmarks WHERE user_id = $1`, [userId]);
      await query(`DELETE FROM progress_items WHERE user_id = $1`, [userId]);
      await query(`DELETE FROM user_settings WHERE id = $1`, [userId]).catch(() => {});
      await query(`DELETE FROM sessions WHERE user = $1`, [userId]);
      await query(`DELETE FROM users WHERE id = $1`, [userId]);

      log.info('User account deleted successfully', { userId });

      return { success: true, message: 'User account deleted successfully' };
    } catch (error) {
      log.error('Failed to delete user account', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw createError({
        statusCode: 500,
        message: 'Failed to delete user account',
        cause: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  throw createError({
    statusCode: 405,
    message: 'Method not allowed',
  });
});
