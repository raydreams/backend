import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../../generated/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

let prismaInstance: PrismaClient | undefined

export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop) {
    if (!prismaInstance) {
      const adapter = new PrismaPg({
        connectionString: process.env.DATABASE_URL,
      })
      prismaInstance = new PrismaClient({ adapter })

      if (process.env.NODE_ENV !== "production") {
        globalForPrisma.prisma = prismaInstance
      }
    }

    return (prismaInstance as any)[prop]
  },
})
