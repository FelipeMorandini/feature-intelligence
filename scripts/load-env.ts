import { loadEnvConfig } from "@next/env";

// Load .env / .env.local with the same precedence rules as Next.js.
loadEnvConfig(process.cwd());
