import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    // Uses DIRECT_URL when available (needed for connection poolers like Supabase/PgBouncer).
    // Falls back to DATABASE_URL for direct connections.
    url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"],
  },
});