import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/config/env";
import { resolveTriageModel } from "./provider";

describe("resolveTriageModel", () => {
  it("reports AI as unavailable without an API key instead of substituting a fake", () => {
    const env = parseServerEnv({ ANTHROPIC_API_KEY: "" });

    expect(resolveTriageModel(env)).toEqual({ available: false, reason: "missing_api_key" });
  });

  it("uses the configured Anthropic model when a key is present", () => {
    const env = parseServerEnv({ ANTHROPIC_API_KEY: "test-key", ANTHROPIC_MODEL: "claude-test" });

    const result = resolveTriageModel(env);

    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.model.modelId).toBe("claude-test");
  });
});
