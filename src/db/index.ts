import "server-only";
import { getServerEnv } from "@/config/env";
import { createDatabase, type AppDatabase } from "./client";

export type { AppDatabase } from "./client";

// Reuse one connection across hot reloads in development.
const globalForDb = globalThis as unknown as { featureIntelligenceDb?: AppDatabase };

/**
 * The application's database connection. Schema changes are applied
 * explicitly with `npm run db:migrate` rather than on first request.
 */
export function getDb(): AppDatabase {
  globalForDb.featureIntelligenceDb ??= createDatabase(getServerEnv().DATABASE_PATH);
  return globalForDb.featureIntelligenceDb;
}
