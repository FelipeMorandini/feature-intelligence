import { z } from "zod";

// Bounded classification and duplicate reasoning in an interactive flow:
// Sonnet gives the better latency/cost tradeoff. Override with ANTHROPIC_MODEL.
export const DEFAULT_TRIAGE_MODEL = "claude-sonnet-5-5";

/**
 * Server-side configuration. Secrets come only from the environment
 * (.env.local in development) and are never committed.
 */
const ServerEnvSchema = z.object({
  DATABASE_PATH: z.string().trim().min(1).default("./data/feature-intelligence.db"),
  // Empty strings are treated as "not configured" so a blank .env.local entry
  // surfaces the honest unavailable state instead of a broken provider call.
  ANTHROPIC_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
  ANTHROPIC_MODEL: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || DEFAULT_TRIAGE_MODEL),
  TRIAGE_TIMEOUT_MS: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().positive().default(45_000),
  ),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const parsed = ServerEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid server environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
