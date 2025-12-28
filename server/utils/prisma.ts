import { PrismaClient } from '../../generated/client';

let prismaInstance: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    // Just call the constructor with no options
    prismaInstance = new PrismaClient(process.env.NODE_ENV === 'production' ? undefined : {} as any);
  }
  return prismaInstance;
}

// Backward compatible proxy
export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    return getPrisma()[prop as keyof PrismaClient];
  },
});
