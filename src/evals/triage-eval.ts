import type { TriageModel } from "@/ai/triage-model";
import { createMigratedMemoryDatabase } from "@/db/client";
import { seedDatabase } from "@/db/seed";
import { AllOpenRequestsRetriever } from "@/triage/candidate-retriever";
import type { MatchConfidence, MatchRelationship } from "@/triage/contract";
import { analyzeSubmission, type AnalyzeResult } from "@/triage/triage-service";
import type { TriageEvalCase } from "./triage-cases";

/**
 * Runs labeled cases through the real Analyze path (retrieval, prompt, model,
 * validation, retry) and scores only the structured outcome.
 *
 * This probes model judgment, which is probabilistic; deterministic behavior
 * and safety boundaries are covered by unit tests with a fake model.
 */

interface ObservedMatch {
  requestId: string;
  relationship: MatchRelationship;
  confidence: MatchConfidence;
}

export type ObservedTriage =
  | { kind: "analyzed"; probableDuplicate: ObservedMatch | null; nonBlocking: ObservedMatch[] }
  | { kind: "error"; reason: string };

export interface CaseResult {
  evalCase: TriageEvalCase;
  observed: ObservedTriage;
  pass: boolean;
}

export function observe(result: AnalyzeResult): ObservedTriage {
  if (result.status === "invalid_input") return { kind: "error", reason: "invalid input" };
  if (result.status === "unavailable") return { kind: "error", reason: `AI unavailable (${result.reason})` };

  const toMatch = ({ requestId, relationship, confidence }: ObservedMatch) => ({ requestId, relationship, confidence });
  return {
    kind: "analyzed",
    probableDuplicate: result.probableDuplicate ? toMatch(result.probableDuplicate) : null,
    nonBlocking: result.otherMatches.map(toMatch),
  };
}

export function scoreCase(evalCase: TriageEvalCase, observed: ObservedTriage): boolean {
  if (observed.kind === "error") return false;
  const { expected } = evalCase;
  const { probableDuplicate, nonBlocking } = observed;

  switch (expected.kind) {
    case "duplicate":
      return probableDuplicate?.requestId === expected.requestId;
    case "related":
      return !probableDuplicate && nonBlocking.some((match) => expected.anyOf.includes(match.requestId));
    case "new":
      // Related, non-blocking matches are acceptable for a new request.
      return !probableDuplicate;
  }
}

export interface EvalSummary {
  total: number;
  errors: number;
  evaluated: number;
  passed: number;
  /** passed / evaluated; null when nothing could be evaluated. */
  caseAccuracy: number | null;
  duplicate: {
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    /** null when the model proposed no duplicates (undefined, not zero). */
    precision: number | null;
    /** null when no evaluated case expects a duplicate. */
    recall: number | null;
  };
}

/**
 * Duplicate detection treats "proposed a probable duplicate" as a positive
 * prediction. Proposing the wrong request counts as both a false positive and
 * a false negative. Errored cases are excluded from metrics and reported.
 */
export function summarize(results: CaseResult[]): EvalSummary {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let evaluated = 0;
  let passed = 0;

  for (const { evalCase, observed, pass } of results) {
    if (observed.kind === "error") continue;
    evaluated++;
    if (pass) passed++;

    const expectedId = evalCase.expected.kind === "duplicate" ? evalCase.expected.requestId : null;
    const predictedId = observed.probableDuplicate?.requestId ?? null;
    const correct = expectedId !== null && predictedId === expectedId;

    if (correct) truePositives++;
    if (predictedId !== null && !correct) falsePositives++;
    if (expectedId !== null && !correct) falseNegatives++;
  }

  const ratio = (numerator: number, denominator: number) => (denominator === 0 ? null : numerator / denominator);

  return {
    total: results.length,
    errors: results.length - evaluated,
    evaluated,
    passed,
    caseAccuracy: ratio(passed, evaluated),
    duplicate: {
      truePositives,
      falsePositives,
      falseNegatives,
      precision: ratio(truePositives, truePositives + falsePositives),
      recall: ratio(truePositives, truePositives + falseNegatives),
    },
  };
}

/**
 * Triages each case sequentially against a fresh in-memory copy of the seeded
 * backlog, so evals never touch the application database.
 */
export async function runTriageEval(
  model: TriageModel,
  cases: TriageEvalCase[],
  onResult?: (result: CaseResult, index: number) => void,
): Promise<CaseResult[]> {
  const db = createMigratedMemoryDatabase();
  seedDatabase(db);
  const deps = { db, retriever: new AllOpenRequestsRetriever(db), model: { available: true as const, model } };

  const results: CaseResult[] = [];
  for (const [index, evalCase] of cases.entries()) {
    const observed = observe(
      await analyzeSubmission(deps, { title: evalCase.title, description: evalCase.description }, null),
    );
    const result = { evalCase, observed, pass: scoreCase(evalCase, observed) };
    results.push(result);
    onResult?.(result, index);
  }
  return results;
}
