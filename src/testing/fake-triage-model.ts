import type { TriageModel, TriageModelRequest } from "@/ai/triage-model";

/** A scripted response: raw output to return, or an error to throw. */
export type FakeTriageResponse = { output: unknown } | { error: Error };

/**
 * Deterministic TriageModel for automated tests and explicit development
 * fixtures ONLY. Application code must never fall back to it — ESLint forbids
 * importing `@/testing/*` outside tests and scripts.
 *
 * Responses are consumed in order, so tests can script retries and failures
 * (e.g. invalid output followed by valid output).
 */
export class FakeTriageModel implements TriageModel {
  readonly modelId = "fake-triage-model";
  readonly requests: TriageModelRequest[] = [];
  private readonly queue: FakeTriageResponse[];

  constructor(responses: FakeTriageResponse[]) {
    this.queue = [...responses];
  }

  async generate(request: TriageModelRequest): Promise<unknown> {
    this.requests.push(request);
    const next = this.queue.shift();
    if (!next) throw new Error("FakeTriageModel has no scripted responses left.");
    if ("error" in next) throw next.error;
    return structuredClone(next.output);
  }
}
