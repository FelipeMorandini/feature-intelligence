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

export type TriageModelErrorKind = "timeout" | "provider_error";

/** A failed model call. Callers map this to an honest unavailable state. */
export class TriageModelError extends Error {
  constructor(
    readonly kind: TriageModelErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "TriageModelError";
  }
}
