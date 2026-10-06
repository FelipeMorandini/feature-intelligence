import { mkdirSync } from "node:fs";
import path from "node:path";
import Database, { type RunResult } from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as schema from "./schema";

/**
 * Database construction, free of Next.js concerns so scripts and tests can use
 * it directly. App code should go through `@/db` (server-only singleton).
 *
 * better-sqlite3 is a native Node.js module: anything importing this file must
 * run on the Node.js runtime (the Next.js default; never the Edge runtime).
 */

export type AppDatabase = BetterSQLite3Database<typeof schema>;

/** The database or an open transaction — for helpers that run inside either. */
export type DbExecutor = BaseSQLiteDatabase<"sync", RunResult, typeof schema>;

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

export function createDatabase(filename: string): AppDatabase {
  if (filename !== ":memory:") {
    mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }

  const sqlite = new Database(filename);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  return drizzle(sqlite, { schema });
}

export function migrateDatabase(db: AppDatabase): void {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

/** A fully migrated in-memory database, used by tests. */
export function createMigratedMemoryDatabase(): AppDatabase {
  const db = createDatabase(":memory:");
  migrateDatabase(db);
  return db;
}
