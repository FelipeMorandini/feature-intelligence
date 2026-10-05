import "./load-env";
import { getServerEnv } from "../src/config/env";
import { createDatabase, migrateDatabase } from "../src/db/client";

const { DATABASE_PATH } = getServerEnv();
migrateDatabase(createDatabase(DATABASE_PATH));
console.log(`Migrations applied to ${DATABASE_PATH}`);
