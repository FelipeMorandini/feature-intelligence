import "./load-env";
import { getServerEnv } from "../src/config/env";
import { createDatabase } from "../src/db/client";
import { seedDatabase } from "../src/db/seed";

const { DATABASE_PATH } = getServerEnv();
const result = seedDatabase(createDatabase(DATABASE_PATH));
console.log(
  `Seeded ${result.requests} feature requests and ${result.supports} supports into ${DATABASE_PATH} (existing data was replaced).`,
);
