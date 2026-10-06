import Anthropic, { APIConnectionTimeoutError, APIError } from "@anthropic-ai/sdk";
import { TriageModelError, type TriageModel, type TriageModelRequest } from "./triage-model";

export interface AnthropicTriageModelConfig {
  apiKey: string;
  modelId: string;
  timeoutMs: number;
}

/** The slice of the SDK client this provider uses; injectable for tests. */
export type AnthropicMessagesClient = Pick<Anthropic, "messages">;

// Room for adaptive thinking plus a ~1-2k token structured answer.
const MAX_OUTPUT_TOKENS = 16_000;

/**
 * Anthropic implementation of TriageModel — the only module that imports the
 * provider SDK.
 *
 * Uses structured outputs (`output_config.format`) so the model is constrained
 * to the contract's JSON Schema. The parsed JSON is still returned as
 * untrusted data: the triage service validates it with Zod before any use.
 *
 * There is deliberately no model fallback: the model recorded on a triage run
 * is exactly the model that was requested. A refusal is a provider failure.
 */
export class AnthropicTriageModel implements TriageModel {
  readonly modelId: string;
  private readonly client: AnthropicMessagesClient;

  constructor(config: AnthropicTriageModelConfig, client?: AnthropicMessagesClient) {
    this.modelId = config.modelId;
    this.client = client ?? createAnthropicClient(config);
  }

  async generate(request: TriageModelRequest): Promise<unknown> {
    let message: Anthropic.Message;
    try {
      message = await this.client.messages.create({
        model: this.modelId,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
        output_config: {
          format: { type: "json_schema", schema: toAnthropicJsonSchema(request.output.jsonSchema) },
        },
      });
    } catch (error) {
      throw toTriageModelError(error);
    }

    if (message.stop_reason === "refusal") {
      throw new TriageModelError(
        "provider_error",
        `The model declined the request (category: ${message.stop_details?.category ?? "unspecified"}).`,
      );
    }

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Only a normal, complete stop can succeed. max_tokens,
    // model_context_window_exceeded or any other reason means the response may
    // be incomplete: it is never trusted, even if it happens to parse and validate.
    if (message.stop_reason !== "end_turn") {
      throw new TriageModelError(
        "incomplete_output",
        `The model stopped before completing its response (stop reason: ${message.stop_reason ?? "none"}).`,
        { partialOutput: text },
      );
    }

    // Unparseable text is returned as-is so the caller treats it as invalid
    // output and can retry, not as a provider outage.
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}

/**
 * SDK retries are disabled: an Analyze makes at most two model calls (the
 * initial one plus the application's single corrective retry), and provider
 * failures surface through the honest unavailable path instead of being
 * retried invisibly.
 */
export function createAnthropicClient(config: AnthropicTriageModelConfig): Anthropic {
  return new Anthropic({
    apiKey: config.apiKey,
    // Only ANTHROPIC_API_KEY is used; never fall back to other ambient credentials.
    authToken: null,
    timeout: config.timeoutMs,
    maxRetries: 0,
  });
}

function toTriageModelError(error: unknown): TriageModelError {
  if (error instanceof APIConnectionTimeoutError) {
    return new TriageModelError("timeout", "The AI provider did not respond in time.", { cause: error });
  }
  if (error instanceof APIError) {
    // Status and message only: never request headers, which carry the API key.
    const status = error.status ?? "connection";
    return new TriageModelError("provider_error", `Anthropic API error (${status}): ${error.message}`.slice(0, 300), {
      cause: error,
    });
  }
  return new TriageModelError("provider_error", "Unexpected error while calling the AI provider.", { cause: error });
}

// Keywords structured outputs do not accept. The contract still enforces them,
// because the application validates every response with Zod.
const UNSUPPORTED_KEYWORDS = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "uniqueItems",
  "pattern",
]);

const SUBSCHEMA_LIST_KEYS = new Set(["anyOf", "allOf", "oneOf", "prefixItems"]);

/**
 * Adapts a standard JSON Schema to the subset structured outputs supports:
 * strips unsupported constraints, turns small bounded integer ranges (the 1-5
 * rubric scores) into enums so the constraint still reaches the model, and
 * closes every object with `additionalProperties: false`.
 */
export function toAnthropicJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue;
    if ((key === "properties" || key === "$defs" || key === "definitions") && isRecord(value)) {
      result[key] = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [name, isRecord(child) ? toAnthropicJsonSchema(child) : child]),
      );
    } else if (key === "items" && isRecord(value)) {
      result[key] = toAnthropicJsonSchema(value);
    } else if (SUBSCHEMA_LIST_KEYS.has(key) && Array.isArray(value)) {
      result[key] = value.map((child) => (isRecord(child) ? toAnthropicJsonSchema(child) : child));
    } else {
      result[key] = value;
    }
  }

  const { minimum, maximum } = schema;
  if (
    schema.type === "integer" &&
    Number.isInteger(minimum) &&
    Number.isInteger(maximum) &&
    (maximum as number) - (minimum as number) <= 10 &&
    !("enum" in schema)
  ) {
    result.enum = Array.from({ length: (maximum as number) - (minimum as number) + 1 }, (_, i) => (minimum as number) + i);
  }

  if (schema.type === "object") result.additionalProperties = false;
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
