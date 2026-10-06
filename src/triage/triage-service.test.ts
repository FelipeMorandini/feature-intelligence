import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicTriageModel, type AnthropicMessagesClient } from "@/ai/anthropic-triage-model";
import { resolveTriageModel } from "@/ai/provider";
import { TriageModelError } from "@/ai/triage-model";
import { parseServerEnv } from "@/config/env";
import { createMigratedMemoryDatabase, type AppDatabase } from "@/db/client";
import { featureRequests, supports, triageDecisions, triageRuns } from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import { listConsolidatedSubmissions } from "@/requests/queries";
import { countSupports, supportRequest } from "@/requests/support";
import { FakeTriageModel, type FakeTriageResponse } from "@/testing/fake-triage-model";
import { AllOpenRequestsRetriever } from "./candidate-retriever";
import type { TriageModelOutput } from "./contract";
import { TRIAGE_PROMPT_VERSION } from "./prompt";
import { analyzeSubmission, decideTriage, type AnalyzeResult } from "./triage-service";

const SUBMISSION = {
  title: "Teams alerts when work is assigned to me",
  description: "I never notice when a task lands on my plate. Send me a Microsoft Teams message when I'm assigned.",
};
const VOTER = "11111111-1111-4111-8111-111111111111";

function output(overrides: Partial<TriageModelOutput> = {}): TriageModelOutput {
  return {
    problemStatement: "People miss new assignments because alerts only appear inside the product.",
    theme: "notifications",
    themeRationale: "About alerting people when work is assigned.",
    matches: [],
    rubric: {
      severity: { score: 4, rationale: "Missed assignments delay work." },
      strategicAlignment: { score: 4, rationale: "Reduces status-chasing.", goalIds: ["reduce-coordination-work"] },
      workaroundGap: { score: 3, rationale: "Email exists but is ignored." },
    },
    ...overrides,
  };
}

const chatDuplicate = output({
  matches: [
    {
      requestId: "seed-chat-assignment-alerts",
      relationship: "duplicate",
      confidence: "high",
      sharedNeed: "Both want to be told in chat when work is assigned to them.",
      differences: "Teams instead of Slack.",
    },
  ],
});

describe("triage service", () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = createMigratedMemoryDatabase();
    seedDatabase(db);
  });

  const requestCount = () => db.select({ total: count() }).from(featureRequests).get()!.total;
  const runRow = (id: string) => db.select().from(triageRuns).where(eq(triageRuns.id, id)).get()!;

  function deps(responses: FakeTriageResponse[]) {
    const model = new FakeTriageModel(responses);
    return { model, deps: { db, retriever: new AllOpenRequestsRetriever(db), model: { available: true as const, model } } };
  }

  async function analyze(responses: FakeTriageResponse[], input = SUBMISSION) {
    const { model, deps: d } = deps(responses);
    const result = await analyzeSubmission(d, input, VOTER);
    return { result, model };
  }

  function expectAnalyzed(result: AnalyzeResult) {
    if (result.status !== "analyzed") throw new Error(`expected analyzed, got ${result.status}`);
    return result;
  }

  it("records an auditable run on Analyze but creates no request", async () => {
    const before = requestCount();
    const { result, model } = await analyze([{ output: output() }]);

    const analyzed = expectAnalyzed(result);
    expect(analyzed.probableDuplicate).toBeNull();
    // The review reflects the submitter as the first supporter.
    expect(analyzed.analysis.priority.components.find((c) => c.dimension === "observedDemand")).toMatchObject({
      input: 1,
      points: expect.any(Number),
    });
    expect(requestCount()).toBe(before);

    const run = runRow(analyzed.triageRunId);
    expect(run).toMatchObject({
      status: "succeeded",
      model: model.modelId,
      promptVersion: TRIAGE_PROMPT_VERSION,
      inputTitle: SUBMISSION.title,
      validatedOutput: output(),
    });
    expect(run.candidateIds).toContain("seed-chat-assignment-alerts");
    expect(model.requests[0].prompt).toContain("<submitted_request>");
  });

  it("creates the request from the server-stored, validated enrichment", async () => {
    const { result } = await analyze([{ output: output() }]);
    const { triageRunId } = expectAnalyzed(result);

    const decision = decideTriage(db, triageRunId, { action: "create", ...SUBMISSION }, VOTER);

    expect(decision).toMatchObject({ status: "created", triaged: true });
    if (decision.status !== "created") return;
    const created = db.select().from(featureRequests).where(eq(featureRequests.id, decision.requestId)).get()!;
    expect(created).toMatchObject({
      title: SUBMISSION.title,
      triageStatus: "complete",
      triageRunId,
      theme: "notifications",
      problemStatement: output().problemStatement,
    });
    expect(created.enrichment?.rubric).toEqual(output().rubric);
    // The submitter is the first supporter.
    expect(countSupports(db, decision.requestId)).toBe(1);
    expect(db.select().from(supports).where(eq(supports.requestId, decision.requestId)).get()).toMatchObject({
      voterId: VOTER,
      source: "direct",
    });
    // Repeating the decision (e.g. a double click) is idempotent and adds no support.
    expect(decideTriage(db, triageRunId, { action: "create", ...SUBMISSION }, VOTER)).toEqual(decision);
    expect(decideTriage(db, triageRunId, { action: "create", ...SUBMISSION }, "other-voter")).toEqual(decision);
    expect(countSupports(db, decision.requestId)).toBe(1);
  });

  it("ignores enrichment forged by the client", async () => {
    const { result } = await analyze([{ output: output() }]);
    const { triageRunId } = expectAnalyzed(result);

    const decision = decideTriage(
      db,
      triageRunId,
      {
        action: "create",
        ...SUBMISSION,
        theme: "other",
        problemStatement: "Forged",
        enrichment: { rubric: { severity: { score: 5 } } },
      },
      VOTER,
    );

    if (decision.status !== "created") throw new Error(decision.status);
    const created = db.select().from(featureRequests).where(eq(featureRequests.id, decision.requestId)).get()!;
    expect(created.theme).toBe("notifications");
    expect(created.problemStatement).toBe(output().problemStatement);
    expect(created.enrichment?.rubric.severity.score).toBe(4);
  });

  it("refuses to reuse an analysis for different text", async () => {
    const { result } = await analyze([{ output: output() }]);
    const { triageRunId } = expectAnalyzed(result);
    const before = requestCount();

    const decision = decideTriage(
      db,
      triageRunId,
      { action: "create", title: SUBMISSION.title, description: "Something else entirely, edited after Analyze." },
      VOTER,
    );

    expect(decision).toEqual({ status: "stale_analysis" });
    expect(requestCount()).toBe(before);
  });

  it("requires a human decision for a probable duplicate", async () => {
    const { result } = await analyze([{ output: chatDuplicate }]);
    const analyzed = expectAnalyzed(result);
    const before = requestCount();

    expect(analyzed.probableDuplicate).toMatchObject({
      requestId: "seed-chat-assignment-alerts",
      title: "Slack notifications when a task is assigned to me",
      supportCount: 14,
      confidence: "high",
      sharedNeed: expect.any(String),
      differences: "Teams instead of Slack.",
    });
    expect(analyzed.probableDuplicate?.priority).not.toBeNull();

    const decision = decideTriage(db, analyzed.triageRunId, { action: "create", ...SUBMISSION }, VOTER);

    expect(decision).toEqual({ status: "decision_required", suggestedRequestId: "seed-chat-assignment-alerts" });
    expect(requestCount()).toBe(before);
  });

  it("records supported_existing and keeps the submitter's wording", async () => {
    const { result } = await analyze([{ output: chatDuplicate }]);
    const { triageRunId } = expectAnalyzed(result);
    const body = { action: "support_existing", requestId: "seed-chat-assignment-alerts", ...SUBMISSION };
    const before = requestCount();

    const decision = decideTriage(db, triageRunId, body, VOTER);

    expect(decision).toEqual({
      status: "supported",
      requestId: "seed-chat-assignment-alerts",
      supportCount: 15,
      alreadySupported: false,
    });
    expect(requestCount()).toBe(before);
    expect(db.select().from(triageDecisions).where(eq(triageDecisions.triageRunId, triageRunId)).all()).toEqual([
      expect.objectContaining({
        decision: "supported_existing",
        suggestedRequestId: "seed-chat-assignment-alerts",
        resultingRequestId: "seed-chat-assignment-alerts",
        aiConfidence: "high",
      }),
    ]);
    const support = db.select().from(supports).where(eq(supports.voterId, VOTER)).get()!;
    expect(support).toMatchObject({ source: "duplicate_redirect", requestId: "seed-chat-assignment-alerts" });
    expect(support.comment).toContain(SUBMISSION.description);

    // Repeating is idempotent: no second support or decision.
    expect(decideTriage(db, triageRunId, body, VOTER)).toMatchObject({ status: "supported", supportCount: 15 });
    expect(db.select().from(triageDecisions).all()).toHaveLength(1);
  });

  it("records created_new when the person overrides the duplicate", async () => {
    const { result } = await analyze([{ output: chatDuplicate }]);
    const { triageRunId } = expectAnalyzed(result);

    const decision = decideTriage(db, triageRunId, { action: "create", createAnyway: true, ...SUBMISSION }, VOTER);

    if (decision.status !== "created") throw new Error(decision.status);
    expect(db.select().from(triageDecisions).where(eq(triageDecisions.triageRunId, triageRunId)).get()).toMatchObject({
      decision: "created_new",
      suggestedRequestId: "seed-chat-assignment-alerts",
      aiConfidence: "high",
      resultingRequestId: decision.requestId,
    });
    // The analysis cannot then be reused to also support the duplicate.
    expect(
      decideTriage(
        db,
        triageRunId,
        { action: "support_existing", requestId: "seed-chat-assignment-alerts", ...SUBMISSION },
        VOTER,
      ),
    ).toEqual({ status: "already_decided", requestId: decision.requestId });
  });

  it("cannot act on a hallucinated or unproposed request id", async () => {
    const hallucinated = output({
      matches: [{ ...chatDuplicate.matches[0], requestId: "seed-invented-by-model" }],
    });
    // The retry is spent correcting the unknown id; the model repeats it.
    const { result, model } = await analyze([{ output: hallucinated }, { output: hallucinated }]);
    const analyzed = expectAnalyzed(result);

    expect(model.requests).toHaveLength(2);
    expect(model.requests[1].prompt).toContain("seed-invented-by-model");
    expect(analyzed.probableDuplicate).toBeNull();
    for (const requestId of ["seed-invented-by-model", "seed-dark-mode"]) {
      expect(
        decideTriage(db, analyzed.triageRunId, { action: "support_existing", requestId, ...SUBMISSION }, VOTER),
      ).toEqual({ status: "invalid_target" });
    }
  });

  it("retries malformed output once with validation feedback", async () => {
    const { result, model } = await analyze([
      { output: { ...output(), theme: "blockchain" } },
      { output: output() },
    ]);

    const analyzed = expectAnalyzed(result);
    expect(model.requests).toHaveLength(2);
    expect(model.requests[1].prompt).toContain("<validation_feedback>");
    expect(model.requests[1].prompt).toContain("theme");
    expect(runRow(analyzed.triageRunId).rawOutput).toMatchObject({
      attempts: [{ attempt: 1, validationErrors: expect.any(String) }, { attempt: 2 }],
    });
  });

  it("fails honestly after malformed output twice, then allows an untriaged request", async () => {
    const { result, model } = await analyze([{ output: "not json" }, { output: { theme: "notifications" } }]);

    expect(result).toMatchObject({ status: "unavailable", reason: "invalid_output" });
    expect(model.requests).toHaveLength(2);
    if (result.status !== "unavailable") return;
    expect(runRow(result.triageRunId)).toMatchObject({ status: "invalid_output", validatedOutput: null });

    const decision = decideTriage(db, result.triageRunId, { action: "create", ...SUBMISSION }, VOTER);
    if (decision.status !== "created") throw new Error(decision.status);
    expect(decision.triaged).toBe(false);
    expect(countSupports(db, decision.requestId)).toBe(1);
    expect(db.select().from(featureRequests).where(eq(featureRequests.id, decision.requestId)).get()).toMatchObject({
      title: SUBMISSION.title,
      triageStatus: "failed",
      theme: null,
      problemStatement: null,
      enrichment: null,
    });
  });

  it("falls back without retrying when the provider fails", async () => {
    const { result, model } = await analyze([
      { error: new TriageModelError("timeout", "The AI provider did not respond in time.") },
    ]);

    expect(result).toMatchObject({ status: "unavailable", reason: "timeout" });
    expect(model.requests).toHaveLength(1);
    if (result.status !== "unavailable") return;
    expect(runRow(result.triageRunId)).toMatchObject({
      status: "provider_error",
      error: "The AI provider did not respond in time.",
    });
  });

  describe("when the corrective retry fails after a usable first result", () => {
    // Valid first result: a real duplicate plus an invented id, which is dropped.
    const usableFirst = output({
      matches: [
        { ...chatDuplicate.matches[0], requestId: "seed-invented-by-model" },
        chatDuplicate.matches[0],
      ],
    });

    it.each<[string, FakeTriageResponse]>([
      ["malformed output", { output: { theme: "blockchain" } }],
      ["a provider failure", { error: new TriageModelError("provider_error", "Anthropic API error (529): overloaded") }],
    ])("keeps the sanitized first result after %s", async (_label, secondAttempt) => {
      const { result, model } = await analyze([{ output: usableFirst }, secondAttempt]);

      const analyzed = expectAnalyzed(result);
      expect(model.requests).toHaveLength(2);
      expect(analyzed.probableDuplicate?.requestId).toBe("seed-chat-assignment-alerts");
      expect(analyzed.otherMatches.map((m) => m.requestId)).not.toContain("seed-invented-by-model");

      const run = runRow(analyzed.triageRunId);
      expect(run.status).toBe("succeeded");
      expect(run.rawOutput).toMatchObject({ usedAttempt: 1, attempts: [{ attempt: 1 }, { attempt: 2 }] });

      // The real duplicate still requires a human decision.
      expect(decideTriage(db, analyzed.triageRunId, { action: "create", ...SUBMISSION }, VOTER)).toEqual({
        status: "decision_required",
        suggestedRequestId: "seed-chat-assignment-alerts",
      });
    });
  });

  it("keeps a consolidated submission even when the voter already supported the request", async () => {
    const target = "seed-chat-assignment-alerts";
    expect(supportRequest(db, target, VOTER)).toEqual({ status: "supported", supportCount: 15 });

    const { result } = await analyze([{ output: chatDuplicate }]);
    const { triageRunId } = expectAnalyzed(result);
    const decision = decideTriage(db, triageRunId, { action: "support_existing", requestId: target, ...SUBMISSION }, VOTER);

    expect(decision).toEqual({ status: "supported", requestId: target, supportCount: 15, alreadySupported: true });
    expect(db.select().from(triageDecisions).where(eq(triageDecisions.triageRunId, triageRunId)).get()).toMatchObject({
      decision: "supported_existing",
      resultingRequestId: target,
    });
    expect(listConsolidatedSubmissions(db, target)).toEqual([
      expect.objectContaining({ title: SUBMISSION.title, description: SUBMISSION.description }),
    ]);
  });

  describe("with the Anthropic provider (mocked SDK client)", () => {
    function anthropicDeps(create: ReturnType<typeof vi.fn>) {
      const client = { messages: { create } } as unknown as AnthropicMessagesClient;
      const model = new AnthropicTriageModel({ apiKey: "test", modelId: "claude-sonnet-5-5", timeoutMs: 1000 }, client);
      return { db, retriever: new AllOpenRequestsRetriever(db), model: { available: true as const, model } };
    }
    const response = (stop_reason: string) => ({
      stop_reason,
      stop_details: null,
      content: [{ type: "text", text: JSON.stringify(output()) }],
    });

    it("never accepts output cut off at max_tokens, even when it validates", async () => {
      const create = vi.fn().mockResolvedValue(response("max_tokens"));

      const result = await analyzeSubmission(anthropicDeps(create), SUBMISSION, VOTER);

      expect(result).toMatchObject({ status: "unavailable", reason: "invalid_output" });
      // One attempt plus the single corrective retry, never more.
      expect(create).toHaveBeenCalledTimes(2);
      if (result.status !== "unavailable") return;
      expect(runRow(result.triageRunId)).toMatchObject({ status: "invalid_output", validatedOutput: null });
    });

    it("uses the corrective retry after a truncated response", async () => {
      const create = vi.fn().mockResolvedValueOnce(response("max_tokens")).mockResolvedValueOnce(response("end_turn"));

      const result = await analyzeSubmission(anthropicDeps(create), SUBMISSION, VOTER);

      expect(result.status).toBe("analyzed");
      expect(create.mock.calls[1][0].messages[0].content).toContain("cut off");
    });

    it("treats a refusal as a provider failure without retrying or switching models", async () => {
      const create = vi.fn().mockResolvedValue(response("refusal"));

      const result = await analyzeSubmission(anthropicDeps(create), SUBMISSION, VOTER);

      expect(result).toMatchObject({ status: "unavailable", reason: "provider_error" });
      expect(create).toHaveBeenCalledTimes(1);
      if (result.status !== "unavailable") return;
      expect(runRow(result.triageRunId)).toMatchObject({
        status: "provider_error",
        model: "claude-sonnet-5-5",
        validatedOutput: null,
      });
    });
  });

  it("reports an honest unavailable state without an API key, and still allows submission", async () => {
    const result = await analyzeSubmission(
      {
        db,
        retriever: new AllOpenRequestsRetriever(db),
        model: resolveTriageModel(parseServerEnv({ ANTHROPIC_API_KEY: "" })),
      },
      SUBMISSION,
      VOTER,
    );

    expect(result).toMatchObject({ status: "unavailable", reason: "not_configured" });
    if (result.status !== "unavailable") return;
    expect(runRow(result.triageRunId)).toMatchObject({ status: "unavailable", validatedOutput: null });
    expect(decideTriage(db, result.triageRunId, { action: "create", ...SUBMISSION }, VOTER)).toMatchObject({
      status: "created",
      triaged: false,
    });
  });

  it("rejects invalid input before any model call", async () => {
    const { result, model } = await analyze([], { title: "Hi", description: "short" });

    expect(result).toMatchObject({ status: "invalid_input", fieldErrors: { title: expect.any(String) } });
    expect(model.requests).toHaveLength(0);
  });
});
