import { APIConnectionTimeoutError } from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { buildTriagePrompt } from "@/triage/prompt";
import { AnthropicTriageModel, toAnthropicJsonSchema, type AnthropicMessagesClient } from "./anthropic-triage-model";
import { TriageModelError } from "./triage-model";

const request = buildTriagePrompt({
  input: { title: "Dark mode please", description: "The white UI hurts my eyes at night." },
  candidates: [],
});

function modelWith(create: ReturnType<typeof vi.fn>, modelId = "claude-sonnet-5-5") {
  const client = { messages: { create } } as unknown as AnthropicMessagesClient;
  return new AnthropicTriageModel({ apiKey: "test", modelId, timeoutMs: 1000 }, client);
}

const VALID_JSON = '{"theme":"experience"}';

const message = (text: string, stop_reason = "end_turn") => ({
  stop_reason,
  stop_details: null,
  content: [
    { type: "thinking", thinking: "" },
    { type: "text", text },
  ],
});

describe("AnthropicTriageModel", () => {
  it("sends a structured-output request to exactly the configured model", async () => {
    const create = vi.fn().mockResolvedValue(message(VALID_JSON));

    await expect(modelWith(create).generate(request)).resolves.toEqual({ theme: "experience" });

    const params = create.mock.calls[0][0];
    expect(params).toMatchObject({
      model: "claude-sonnet-5-5",
      system: request.system,
      messages: [{ role: "user", content: request.prompt }],
      output_config: { format: { type: "json_schema" } },
    });
    // No server-side model fallback: provenance stays the requested model.
    expect(params).not.toHaveProperty("fallbacks");
    expect(params).not.toHaveProperty("betas");
  });

  it("returns unparseable text untouched so validation can reject it", async () => {
    const create = vi.fn().mockResolvedValue(message('{"theme": "exper'));

    await expect(modelWith(create).generate(request)).resolves.toBe('{"theme": "exper');
  });

  it("never accepts a max_tokens response, even when it parses", async () => {
    const truncated = modelWith(vi.fn().mockResolvedValue(message(VALID_JSON, "max_tokens")));

    await expect(truncated.generate(request)).rejects.toMatchObject({
      kind: "incomplete_output",
      partialOutput: VALID_JSON,
    });
  });

  it("classifies timeouts and refusals as provider failures", async () => {
    const timeout = modelWith(vi.fn().mockRejectedValue(new APIConnectionTimeoutError()));
    await expect(timeout.generate(request)).rejects.toMatchObject({ kind: "timeout" });

    const refusal = modelWith(vi.fn().mockResolvedValue(message(VALID_JSON, "refusal")));
    await expect(refusal.generate(request)).rejects.toBeInstanceOf(TriageModelError);
    await expect(refusal.generate(request)).rejects.toMatchObject({ kind: "provider_error" });
  });
});

describe("toAnthropicJsonSchema", () => {
  it("keeps only constructs structured outputs supports", () => {
    const schema = toAnthropicJsonSchema(request.output.jsonSchema);
    const serialized = JSON.stringify(schema);

    for (const keyword of ["$schema", "minLength", "maxLength", "minimum", "maximum", "maxItems"]) {
      expect(serialized).not.toContain(`"${keyword}"`);
    }
    const objectNodes: Record<string, unknown>[] = [];
    JSON.parse(serialized, (_key, value) => {
      if (value && typeof value === "object" && value.type === "object") objectNodes.push(value);
      return value;
    });
    expect(objectNodes.length).toBeGreaterThan(3);
    expect(objectNodes.every((node) => node.additionalProperties === false)).toBe(true);
    // Rubric score bounds survive as an enum.
    expect(serialized).toContain('"enum":[1,2,3,4,5]');
  });
});
