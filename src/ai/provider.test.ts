import { describe, expect, it } from "vitest";
import { DEFAULT_TRIAGE_MODEL, parseServerEnv } from "@/config/env";
import { resolveTriageModel } from "./provider";

describe("resolveTriageModel", () => {
  it("reports AI as unavailable without an API key instead of substituting a fake", () => {
    const env = parseServerEnv({ ANTHROPIC_API_KEY: "" });

    expect(resolveTriageModel(env)).toEqual({ available: false, reason: "missing_api_key" });
  });

  it("defaults to Claude Sonnet 5.5", () => {
    const result = resolveTriageModel(parseServerEnv({ ANTHROPIC_API_KEY: "test-key" }));

    expect(DEFAULT_TRIAGE_MODEL).toBe("claude-sonnet-5-5");
    expect(result.available && result.model.modelId).toBe("claude-sonnet-5-5");
    // A blank value in .env.local also falls back to the default.
    expect(parseServerEnv({ ANTHROPIC_MODEL: "" }).ANTHROPIC_MODEL).toBe("claude-sonnet-5-5");
  });

  it("lets ANTHROPIC_MODEL override the default", () => {
    const env = parseServerEnv({ ANTHROPIC_API_KEY: "test-key", ANTHROPIC_MODEL: "claude-opus-5-5" });

    const result = resolveTriageModel(env);

    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.model.modelId).toBe("claude-opus-5-5");
  });
});
