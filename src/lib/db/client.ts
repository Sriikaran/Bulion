import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

const connectionString =
  process.env.DATABASE_URL ||
  process.env.DIRECT_URL ||
  "postgresql://postgres:postgres@localhost:5432/bullion?schema=bullion";

let schema = "bullion";
try {
  const parsedUrl = new URL(connectionString);
  schema = parsedUrl.searchParams.get("schema") || "bullion";
} catch {
  schema = "bullion";
}

const pool =
  globalForPrisma.pool ??
  new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

if (!globalForPrisma.pool) {
  pool.on("error", (err) => {
    console.error("Unexpected error on idle pg client in Bullion", err);
  });
  globalForPrisma.pool = pool;
}

const adapter = new PrismaPg(pool, { schema });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = prisma;
}

