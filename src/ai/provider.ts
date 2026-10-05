import type { ServerEnv } from "@/config/env";
import { AnthropicTriageModel } from "./anthropic-triage-model";
import type { TriageModel } from "./triage-model";

export type TriageModelAvailability =
  | { available: true; model: TriageModel }
  | { available: false; reason: "missing_api_key" };

/**
 * Chooses the real provider from configuration.
 *
 * There is intentionally no fallback model: without an API key the result is
 * "unavailable", and the UI must say so. Fake output is only ever injected
 * explicitly by tests or development fixtures.
 */
export function resolveTriageModel(
  env: Pick<ServerEnv, "ANTHROPIC_API_KEY" | "ANTHROPIC_MODEL" | "TRIAGE_TIMEOUT_MS">,
): TriageModelAvailability {
  if (!env.ANTHROPIC_API_KEY) {
    return { available: false, reason: "missing_api_key" };
  }

  return {
    available: true,
    model: new AnthropicTriageModel({
      apiKey: env.ANTHROPIC_API_KEY,
      modelId: env.ANTHROPIC_MODEL,
      timeoutMs: env.TRIAGE_TIMEOUT_MS,
    }),
  };
}
