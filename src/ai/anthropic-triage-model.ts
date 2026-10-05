import { TriageModelError, type TriageModel, type TriageModelRequest } from "./triage-model";

export interface AnthropicTriageModelConfig {
  apiKey: string;
  modelId: string;
  timeoutMs: number;
}

/**
 * Anthropic implementation of TriageModel. This is the only module that will
 * import the provider SDK.
 *
 * Not implemented in the foundation stage: calls fail with a provider error,
 * which the application surfaces as an honest "AI triage unavailable" state.
 */
export class AnthropicTriageModel implements TriageModel {
  readonly modelId: string;

  constructor(private readonly config: AnthropicTriageModelConfig) {
    this.modelId = config.modelId;
  }

  async generate(request: TriageModelRequest): Promise<unknown> {
    void request;
    throw new TriageModelError(
      "provider_error",
      "The Anthropic provider is not implemented yet.",
    );
  }
}
