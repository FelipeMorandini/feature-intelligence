import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { TriageModelAvailability } from "@/ai/provider";
import { TriageModelError, type TriageModel } from "@/ai/triage-model";
import type { AppDatabase, DbExecutor } from "@/db/client";
import { featureRequests, triageDecisions, triageRuns, type TriageRunRow, type TriageRunStatus } from "@/db/schema";
import { computePriority, type PriorityAssessment } from "@/domain/priority";
import { getTheme, type Theme } from "@/domain/themes";
import { getBacklogItemsByIds } from "@/requests/queries";
import { countSupports, recordSupport } from "@/requests/support";
import type { CandidateRetriever, TriageCandidate } from "./candidate-retriever";
import {
  getProbableDuplicates,
  toRequestEnrichment,
  TriageModelOutputSchema,
  validateTriageOutput,
  type MatchConfidence,
  type MatchRelationship,
  type TriageModelOutput,
  type TriageRubric,
} from "./contract";
import { FeatureRequestInputSchema, hashTriageInput, type FeatureRequestInput } from "./input";
import { buildTriagePrompt, TRIAGE_PROMPT_VERSION } from "./prompt";

/**
 * Analyze → Decide orchestration.
 *
 * Analyze calls the model and stores an auditable triage run; it never creates
 * a request. Decide performs the action a person chose, using only the input
 * and validated output stored on the run — never enrichment from the client.
 */

/** One initial attempt plus at most one corrective retry. */
export const MAX_MODEL_ATTEMPTS = 2;

/** The submitter is the first supporter of the request they create. */
export const SUBMITTER_SUPPORTS = 1;
const MAX_FEEDBACK_LENGTH = 1_500;

export interface TriageDependencies {
  db: AppDatabase;
  retriever: CandidateRetriever;
  model: TriageModelAvailability;
}

export type TriageUnavailableReason = "not_configured" | "timeout" | "provider_error" | "invalid_output";

export interface TriageMatchView {
  requestId: string;
  title: string;
  theme: Theme | null;
  supportCount: number;
  priority: Pick<PriorityAssessment, "score" | "band"> | null;
  supportedByViewer: boolean;
  relationship: MatchRelationship;
  confidence: MatchConfidence;
  sharedNeed: string;
  differences: string;
}

export interface TriageAnalysisView {
  problemStatement: string;
  theme: Theme;
  themeRationale: string;
  rubric: TriageRubric;
  /** Computed by application code for a new request whose only supporter is its submitter. */
  priority: PriorityAssessment;
}

export type AnalyzeResult =
  | { status: "invalid_input"; fieldErrors: Partial<Record<keyof FeatureRequestInput, string>> }
  | {
      status: "analyzed";
      triageRunId: string;
      analysis: TriageAnalysisView;
      /** Best high/medium-confidence duplicate: creating a new request needs a human decision. */
      probableDuplicate: TriageMatchView | null;
      /** Further duplicates, low-confidence matches and related requests (informational). */
      otherMatches: TriageMatchView[];
    }
  | { status: "unavailable"; triageRunId: string; reason: TriageUnavailableReason };

// ---------------------------------------------------------------------------
// Analyze
// ---------------------------------------------------------------------------

interface AttemptRecord {
  attempt: number;
  output: unknown;
  validationErrors?: string;
  droppedMatchIds?: string[];
  providerError?: string;
}

type ModelOutcome =
  | { status: "succeeded"; output: TriageModelOutput; usedAttempt: number; attempts: AttemptRecord[] }
  | { status: "invalid_output"; error: string; attempts: AttemptRecord[] }
  | { status: "provider_error"; reason: "timeout" | "provider_error"; error: string; attempts: AttemptRecord[] };

async function runModel(
  model: TriageModel,
  input: FeatureRequestInput,
  candidates: TriageCandidate[],
): Promise<ModelOutcome> {
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const attempts: AttemptRecord[] = [];
  let validationFeedback: string | undefined;
  // A schema-valid result whose unknown match ids were already removed. If the
  // corrective retry fails for any reason, this result is used rather than
  // discarded — so a real duplicate it found still goes to human review.
  let usable: { output: TriageModelOutput; attempt: number } | null = null;

  for (let attempt = 1; attempt <= MAX_MODEL_ATTEMPTS; attempt++) {
    let raw: unknown;
    try {
      raw = await model.generate(buildTriagePrompt({ input, candidates, validationFeedback }));
    } catch (error) {
      if (error instanceof TriageModelError && error.kind === "incomplete_output") {
        // Incomplete output counts as an invalid attempt and uses the single
        // corrective retry; it is never accepted as a successful analysis.
        attempts.push({ attempt, output: error.partialOutput ?? null, validationErrors: error.message });
        validationFeedback =
          "- the response was cut off before it was complete. Keep every rationale brief and return the full response.";
        continue;
      }
      // Provider failures are not retried: they surface through the honest
      // unavailable path (the SDK's own retries are disabled too).
      const known = error instanceof TriageModelError;
      const message = known ? error.message : "Unexpected error while calling the AI provider.";
      attempts.push({ attempt, output: null, providerError: message });
      if (usable) return { status: "succeeded", output: usable.output, usedAttempt: usable.attempt, attempts };
      return {
        status: "provider_error",
        reason: known && error.kind === "timeout" ? "timeout" : "provider_error",
        error: message,
        attempts,
      };
    }

    const result = validateTriageOutput(raw, candidateIds);
    const isLastAttempt = attempt === MAX_MODEL_ATTEMPTS;

    if (result.ok && (result.droppedMatchIds.length === 0 || isLastAttempt)) {
      attempts.push({ attempt, output: raw, droppedMatchIds: result.droppedMatchIds });
      return { status: "succeeded", output: result.output, usedAttempt: attempt, attempts };
    }

    if (result.ok) {
      // Unknown ids can never be acted upon (they are dropped), but a typo'd id
      // could hide a real duplicate, so the one retry is spent correcting it.
      attempts.push({ attempt, output: raw, droppedMatchIds: result.droppedMatchIds });
      usable = { output: result.output, attempt };
      validationFeedback = `- matches referenced request ids that are not in <existing_requests>: ${result.droppedMatchIds.join(", ")}. Use only ids listed there.`;
    } else {
      attempts.push({ attempt, output: raw, validationErrors: result.message });
      validationFeedback = result.message.slice(0, MAX_FEEDBACK_LENGTH);
    }
  }

  if (usable) return { status: "succeeded", output: usable.output, usedAttempt: usable.attempt, attempts };
  return {
    status: "invalid_output",
    error: `Model output failed validation on all ${MAX_MODEL_ATTEMPTS} attempts.`,
    attempts,
  };
}

function fieldErrorsFrom(error: z.ZodError): Partial<Record<keyof FeatureRequestInput, string>> {
  const fieldErrors: Partial<Record<keyof FeatureRequestInput, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if ((field === "title" || field === "description") && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}

export async function analyzeSubmission(
  deps: TriageDependencies,
  rawInput: unknown,
  voterId: string | null,
): Promise<AnalyzeResult> {
  const parsed = FeatureRequestInputSchema.safeParse(rawInput);
  if (!parsed.success) return { status: "invalid_input", fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;
  const candidates = await deps.retriever.findCandidates(input);
  const run = {
    id: randomUUID(),
    inputTitle: input.title,
    inputDescription: input.description,
    inputHash: hashTriageInput(input),
    candidateIds: candidates.map((candidate) => candidate.id),
    promptVersion: TRIAGE_PROMPT_VERSION,
  };

  if (!deps.model.available) {
    deps.db
      .insert(triageRuns)
      .values({
        ...run,
        model: "not-configured",
        status: "unavailable",
        error: "ANTHROPIC_API_KEY is not configured.",
        latencyMs: 0,
      })
      .run();
    return { status: "unavailable", triageRunId: run.id, reason: "not_configured" };
  }

  const startedAt = Date.now();
  const outcome = await runModel(deps.model.model, input, candidates);
  const latencyMs = Date.now() - startedAt;

  const statusByOutcome: Record<ModelOutcome["status"], TriageRunStatus> = {
    succeeded: "succeeded",
    invalid_output: "invalid_output",
    provider_error: "provider_error",
  };

  deps.db
    .insert(triageRuns)
    .values({
      ...run,
      model: deps.model.model.modelId,
      status: statusByOutcome[outcome.status],
      rawOutput: {
        attempts: outcome.attempts,
        ...(outcome.status === "succeeded" ? { usedAttempt: outcome.usedAttempt } : {}),
      },
      validatedOutput: outcome.status === "succeeded" ? outcome.output : null,
      error: outcome.status === "succeeded" ? null : outcome.error,
      latencyMs,
    })
    .run();

  if (outcome.status !== "succeeded") {
    // Sanitized summary only; details are persisted on the run for debugging.
    console.warn(`[triage] run ${run.id} ${outcome.status}: ${outcome.error}`);
    return {
      status: "unavailable",
      triageRunId: run.id,
      reason: outcome.status === "invalid_output" ? "invalid_output" : outcome.reason,
    };
  }

  return { status: "analyzed", triageRunId: run.id, ...buildReview(deps.db, outcome.output, voterId) };
}

function buildReview(db: AppDatabase, output: TriageModelOutput, voterId: string | null) {
  const { rubric } = output;
  const analysis: TriageAnalysisView = {
    problemStatement: output.problemStatement,
    theme: getTheme(output.theme),
    themeRationale: output.themeRationale,
    rubric,
    priority: computePriority(
      {
        severity: rubric.severity.score,
        strategicAlignment: rubric.strategicAlignment.score,
        workaroundGap: rubric.workaroundGap.score,
      },
      SUBMITTER_SUPPORTS,
    ),
  };

  const items = getBacklogItemsByIds(
    db,
    output.matches.map((match) => match.requestId),
    voterId,
  );
  const views = output.matches.flatMap((match): TriageMatchView[] => {
    const item = items.get(match.requestId);
    if (!item) return [];
    return [
      {
        requestId: item.id,
        title: item.title,
        theme: item.theme,
        supportCount: item.supportCount,
        priority: item.priority ? { score: item.priority.score, band: item.priority.band } : null,
        supportedByViewer: item.supportedByViewer,
        relationship: match.relationship,
        confidence: match.confidence,
        sharedNeed: match.sharedNeed,
        differences: match.differences,
      },
    ];
  });

  const probableId = getProbableDuplicates(output)[0]?.requestId;
  return {
    analysis,
    probableDuplicate: views.find((view) => view.requestId === probableId) ?? null,
    otherMatches: views.filter((view) => view.requestId !== probableId),
  };
}

// ---------------------------------------------------------------------------
// Decide
// ---------------------------------------------------------------------------

/**
 * The browser sends back only its current text (to prove the decision is for
 * the analyzed text) and the action. Unknown keys — such as forged enrichment —
 * are stripped by the schema and could not be used anyway.
 */
const SubmittedTextSchema = z.object({ title: z.string(), description: z.string() });

export const TriageDecisionBodySchema = z.discriminatedUnion("action", [
  SubmittedTextSchema.extend({
    action: z.literal("create"),
    /** Explicit human override when triage proposed a probable duplicate. */
    createAnyway: z.boolean().default(false),
  }),
  SubmittedTextSchema.extend({
    action: z.literal("support_existing"),
    requestId: z.string().min(1),
  }),
]);

export type DecisionResult =
  | { status: "created"; requestId: string; triaged: boolean }
  | { status: "supported"; requestId: string; supportCount: number; alreadySupported: boolean }
  | { status: "invalid_body" }
  | { status: "not_found" }
  /** The text changed since it was analyzed; Analyze must run again. */
  | { status: "stale_analysis" }
  /** A probable duplicate exists and the person has not explicitly overridden it. */
  | { status: "decision_required"; suggestedRequestId: string }
  /** This analysis was already used for a different decision. */
  | { status: "already_decided"; requestId: string }
  /** The requested support target is not a duplicate proposed by this analysis. */
  | { status: "invalid_target" };

function storedOutput(run: TriageRunRow): TriageModelOutput | null {
  if (run.status !== "succeeded") return null;
  // Re-validate stored data before acting on it (defense in depth).
  return TriageModelOutputSchema.parse(run.validatedOutput);
}

function submissionWording(run: TriageRunRow): string {
  return `${run.inputTitle}\n\n${run.inputDescription}`;
}

export function decideTriage(
  db: AppDatabase,
  triageRunId: string,
  rawBody: unknown,
  voterId: string,
): DecisionResult {
  const body = TriageDecisionBodySchema.safeParse(rawBody);
  if (!body.success) return { status: "invalid_body" };

  const run = db.select().from(triageRuns).where(eq(triageRuns.id, triageRunId)).get();
  if (!run) return { status: "not_found" };

  // The decision must be for exactly the text that was analyzed. Even so, only
  // the server-stored input is ever persisted.
  if (hashTriageInput(body.data) !== run.inputHash) return { status: "stale_analysis" };

  return body.data.action === "create"
    ? createFromRun(db, run, body.data.createAnyway, voterId)
    : supportExistingFromRun(db, run, body.data.requestId, voterId);
}

/** A previous decision for this run, if any — making repeated clicks idempotent. */
function previousDecision(db: DbExecutor, runId: string) {
  const created = db
    .select({ id: featureRequests.id, triageStatus: featureRequests.triageStatus })
    .from(featureRequests)
    .where(eq(featureRequests.triageRunId, runId))
    .get();
  const decision = db.select().from(triageDecisions).where(eq(triageDecisions.triageRunId, runId)).get();
  return { created, decision };
}

function createFromRun(db: AppDatabase, run: TriageRunRow, createAnyway: boolean, voterId: string): DecisionResult {
  const output = storedOutput(run);

  return db.transaction((tx) => {
    const { created, decision } = previousDecision(tx, run.id);
    if (created) return { status: "created", requestId: created.id, triaged: created.triageStatus === "complete" };
    if (decision) return { status: "already_decided", requestId: decision.resultingRequestId };

    const requestId = randomUUID();
    const base = { id: requestId, title: run.inputTitle, description: run.inputDescription, triageRunId: run.id };
    // Submitting a new request expresses demand: the submitter is its first
    // supporter. Replays never reach this point (the request already exists).
    const supportFromSubmitter = () => recordSupport(tx, { requestId, voterId, source: "direct" });

    if (!output) {
      // Triage was unavailable or failed: create the request untriaged, with
      // no enrichment invented on the model's behalf.
      tx.insert(featureRequests).values({ ...base, triageStatus: "failed" }).run();
      supportFromSubmitter();
      return { status: "created", requestId, triaged: false };
    }

    const duplicate = getProbableDuplicates(output)[0];
    if (duplicate && !createAnyway) {
      return { status: "decision_required", suggestedRequestId: duplicate.requestId };
    }

    const enrichment = toRequestEnrichment(output);
    tx.insert(featureRequests)
      .values({
        ...base,
        triageStatus: "complete",
        problemStatement: enrichment.problemStatement,
        theme: enrichment.theme,
        enrichment,
      })
      .run();
    supportFromSubmitter();

    if (duplicate) {
      tx.insert(triageDecisions)
        .values({
          id: randomUUID(),
          triageRunId: run.id,
          suggestedRequestId: duplicate.requestId,
          aiConfidence: duplicate.confidence,
          decision: "created_new",
          resultingRequestId: requestId,
        })
        .run();
    }

    return { status: "created", requestId, triaged: true };
  });
}

function supportExistingFromRun(
  db: AppDatabase,
  run: TriageRunRow,
  requestId: string,
  voterId: string,
): DecisionResult {
  const output = storedOutput(run);
  // Only a duplicate proposed by this validated analysis can be supported this way.
  const match = output ? getProbableDuplicates(output).find((candidate) => candidate.requestId === requestId) : undefined;
  if (!match) return { status: "invalid_target" };

  return db.transaction((tx) => {
    const { created, decision } = previousDecision(tx, run.id);
    if (decision?.decision === "supported_existing" && decision.resultingRequestId === requestId) {
      return { status: "supported", requestId, supportCount: countSupports(tx, requestId), alreadySupported: true };
    }
    if (decision) return { status: "already_decided", requestId: decision.resultingRequestId };
    if (created) return { status: "already_decided", requestId: created.id };

    const target = tx
      .select({ id: featureRequests.id })
      .from(featureRequests)
      .where(eq(featureRequests.id, requestId))
      .get();
    if (!target) return { status: "not_found" };

    const { alreadySupported } = recordSupport(tx, {
      requestId,
      voterId,
      source: "duplicate_redirect",
      comment: submissionWording(run),
    });

    tx.insert(triageDecisions)
      .values({
        id: randomUUID(),
        triageRunId: run.id,
        suggestedRequestId: requestId,
        aiConfidence: match.confidence,
        decision: "supported_existing",
        resultingRequestId: requestId,
      })
      .run();

    return { status: "supported", requestId, supportCount: countSupports(tx, requestId), alreadySupported };
  });
}
