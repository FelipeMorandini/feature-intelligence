import "./load-env";
import { resolveTriageModel } from "../src/ai/provider";
import { getServerEnv } from "../src/config/env";
import { TRIAGE_EVAL_CASES } from "../src/evals/triage-cases";
import { runTriageEval, summarize, type CaseResult, type ObservedTriage } from "../src/evals/triage-eval";
import { TRIAGE_PROMPT_VERSION } from "../src/triage/prompt";

/**
 * `npm run eval` — probes the real model's triage judgment on labeled cases.
 *
 * Unit tests verify deterministic behavior and safety boundaries without an
 * API key; this command makes real, billed Anthropic calls (up to two per
 * case) and is never part of `npm test`. Results are probabilistic: read them
 * as a signal about the prompt and model, not as a gate.
 */

const availability = resolveTriageModel(getServerEnv());
if (!availability.available) {
  console.error("npm run eval needs ANTHROPIC_API_KEY (set it in .env.local). No calls were made.");
  process.exit(1);
}

const { model } = availability;

function describeExpected(result: CaseResult): string {
  const { expected } = result.evalCase;
  if (expected.kind === "duplicate") return `duplicate of ${expected.requestId}`;
  if (expected.kind === "related") return `related to ${expected.anyOf.join(" or ")}`;
  return expected.hardNegativeOf ? `new (not a duplicate of ${expected.hardNegativeOf})` : "new";
}

function describeObserved(observed: ObservedTriage): string {
  if (observed.kind === "error") return `ERROR: ${observed.reason}`;
  if (observed.probableDuplicate) {
    return `duplicate of ${observed.probableDuplicate.requestId} (${observed.probableDuplicate.confidence})`;
  }
  if (observed.nonBlocking.length === 0) return "new (no matches)";
  const matches = observed.nonBlocking.map(
    (match) => `${match.requestId} (${match.relationship}, ${match.confidence})`,
  );
  return `no probable duplicate; non-blocking: ${matches.join(", ")}`;
}

const percent = (value: number | null, detail: string) =>
  value === null ? `n/a (${detail})` : `${Math.round(value * 100)}% (${detail})`;

async function main() {
  console.log(
    `Triage eval · model ${model.modelId} · prompt ${TRIAGE_PROMPT_VERSION} · ${TRIAGE_EVAL_CASES.length} cases`,
  );
  console.log("Each case is triaged against the seeded backlog in an in-memory database.\n");

  const results = await runTriageEval(model, TRIAGE_EVAL_CASES, (result, index) => {
    const status = result.observed.kind === "error" ? "ERROR" : result.pass ? "PASS " : "FAIL ";
    console.log(`${status} ${String(index + 1).padStart(2)}. ${result.evalCase.id}`);
    console.log(`         expected: ${describeExpected(result)}`);
    console.log(`         got:      ${describeObserved(result.observed)}`);
  });

  const summary = summarize(results);
  const { duplicate } = summary;

  console.log("\nSummary");
  console.log(
    `  Case accuracy:        ${percent(summary.caseAccuracy, `${summary.passed}/${summary.evaluated} evaluated cases`)}`,
  );
  console.log(
    `  Duplicate precision:  ${percent(
      duplicate.precision,
      duplicate.truePositives + duplicate.falsePositives === 0
        ? "no duplicates were proposed"
        : `${duplicate.truePositives}/${duplicate.truePositives + duplicate.falsePositives} proposed duplicates were correct`,
    )}`,
  );
  console.log(
    `  Duplicate recall:     ${percent(
      duplicate.recall,
      duplicate.truePositives + duplicate.falseNegatives === 0
        ? "no evaluated case expects a duplicate"
        : `${duplicate.truePositives}/${duplicate.truePositives + duplicate.falseNegatives} expected duplicates were found`,
    )}`,
  );
  if (summary.errors > 0) {
    console.log(
      `  Errors:               ${summary.errors} case(s) could not be triaged and are excluded from the metrics`,
    );
  }
  console.log(`\n${summary.total} cases is a smoke test of model judgment, not a statistically meaningful benchmark.`);
}

main().catch((error: unknown) => {
  console.error("Eval failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
