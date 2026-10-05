import "./load-env";
import { rmSync } from "node:fs";
import { getServerEnv } from "../src/config/env";
import { createDatabase, migrateDatabase } from "../src/db/client";
import { seedDatabase } from "../src/db/seed";

// Deletes the local SQLite file (and WAL side files), then migrates and seeds.
const { DATABASE_PATH } = getServerEnv();
for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`${DATABASE_PATH}${suffix}`, { force: true });
}

const db = createDatabase(DATABASE_PATH);
migrateDatabase(db);
const result = seedDatabase(db);
console.log(
  `Reset ${DATABASE_PATH}: migrated and seeded ${result.requests} feature requests and ${result.supports} supports.`,
);
