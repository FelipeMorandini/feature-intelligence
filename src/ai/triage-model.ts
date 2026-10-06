/**
 * The application's boundary to a language model.
 *
 * Business code depends on this interface, never on a provider SDK. A model
 * has no tools and no database access: it receives a prompt plus an output
 * schema and returns raw, untrusted data that the caller must validate.
 */

export interface TriageModelRequest {
  /** Instructions and explicit product context. */
  system: string;
  /** The task, with user-submitted text strongly delimited as untrusted data. */
  prompt: string;
  /** Name and JSON Schema for the provider's structured-output mode. */
  output: { name: string; jsonSchema: Record<string, unknown> };
}

export interface TriageModel {
  /** Recorded on every triage run for auditability, e.g. "claude-sonnet-5-5". */
  readonly modelId: string;
  /** Returns raw output. Callers must validate it before use. */
  generate(request: TriageModelRequest): Promise<unknown>;
}

/**
 * - timeout / provider_error: the call failed (including refusals); no output.
 * - incomplete_output: the model stopped before finishing (e.g. max_tokens).
 *   Whatever it produced must not be trusted, even if it happens to parse.
 */
export type TriageModelErrorKind = "timeout" | "provider_error" | "incomplete_output";

/** A failed model call. Callers map this to an honest unavailable state. */
export class TriageModelError extends Error {
  /** Partial output kept for the audit trail only (incomplete_output). */
  readonly partialOutput?: unknown;

  constructor(
    readonly kind: TriageModelErrorKind,
    message: string,
    options?: { cause?: unknown; partialOutput?: unknown },
  ) {
    super(message, options);
    this.name = "TriageModelError";
    this.partialOutput = options?.partialOutput;
  }
}
