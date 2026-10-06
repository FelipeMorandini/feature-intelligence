import { describe, expect, it } from "vitest";
import { SEED_REQUESTS } from "@/db/seed-data";
import { FakeTriageModel } from "@/testing/fake-triage-model";
import { FeatureRequestInputSchema } from "@/triage/input";
import { TRIAGE_EVAL_CASES, type TriageEvalCase } from "./triage-cases";
import { runTriageEval, scoreCase, summarize, type CaseResult, type ObservedTriage } from "./triage-eval";

// Structural checks only: the eval itself runs against the real model via
// `npm run eval`. These tests never need an API key.

const seedIds = new Set(SEED_REQUESTS.map((seed) => seed.id));

describe("eval dataset", () => {
  it("is well-formed, references seeded requests and mixes case kinds", () => {
    expect(new Set(TRIAGE_EVAL_CASES.map((c) => c.id)).size).toBe(TRIAGE_EVAL_CASES.length);

    for (const evalCase of TRIAGE_EVAL_CASES) {
      expect(FeatureRequestInputSchema.safeParse(evalCase).success).toBe(true);
      const { expected } = evalCase;
      const referenced =
        expected.kind === "duplicate"
          ? [expected.requestId]
          : expected.kind === "related"
            ? expected.anyOf
            : expected.hardNegativeOf
              ? [expected.hardNegativeOf]
              : [];
      for (const id of referenced) expect(seedIds).toContain(id);
    }

    const kinds = TRIAGE_EVAL_CASES.map((c) => c.expected.kind);
    expect(kinds.filter((kind) => kind === "duplicate").length).toBeGreaterThanOrEqual(3);
    expect(kinds).toContain("related");
    expect(kinds).toContain("new");
    expect(TRIAGE_EVAL_CASES.some((c) => c.expected.kind === "new" && c.expected.hardNegativeOf)).toBe(true);
  });
});

const evalCase = (id: string, expected: TriageEvalCase["expected"]): TriageEvalCase => ({
  id,
  title: "Some feature request",
  description: "A description that is long enough to be valid input.",
  expected,
  notes: "",
});

const analyzed = (
  probableDuplicate: string | null,
  nonBlocking: string[] = [],
): Extract<ObservedTriage, { kind: "analyzed" }> => ({
  kind: "analyzed",
  probableDuplicate: probableDuplicate ? { requestId: probableDuplicate, relationship: "duplicate", confidence: "high" } : null,
  nonBlocking: nonBlocking.map((requestId) => ({ requestId, relationship: "related", confidence: "medium" })),
});

const result = (c: TriageEvalCase, observed: ObservedTriage): CaseResult => ({
  evalCase: c,
  observed,
  pass: scoreCase(c, observed),
});

describe("scoring", () => {
  it("scores each kind of expectation on structured outcomes only", () => {
    const dup = evalCase("d", { kind: "duplicate", requestId: "a" });
    const related = evalCase("r", { kind: "related", anyOf: ["a", "b"] });
    const fresh = evalCase("n", { kind: "new", hardNegativeOf: "a" });

    expect(scoreCase(dup, analyzed("a"))).toBe(true);
    expect(scoreCase(dup, analyzed("b"))).toBe(false);
    expect(scoreCase(related, analyzed(null, ["b"]))).toBe(true);
    expect(scoreCase(related, analyzed("b"))).toBe(false);
    expect(scoreCase(fresh, analyzed(null, ["a"]))).toBe(true);
    expect(scoreCase(fresh, analyzed("a"))).toBe(false);
    expect(scoreCase(fresh, { kind: "error", reason: "timeout" })).toBe(false);
  });

  it("computes duplicate precision and recall, counting a wrong match as both errors", () => {
    const summary = summarize([
      result(evalCase("tp", { kind: "duplicate", requestId: "a" }), analyzed("a")),
      result(evalCase("wrong", { kind: "duplicate", requestId: "a" }), analyzed("b")),
      result(evalCase("missed", { kind: "duplicate", requestId: "a" }), analyzed(null)),
      result(evalCase("fp", { kind: "new" }), analyzed("c")),
      result(evalCase("tn", { kind: "new" }), analyzed(null)),
      result(evalCase("err", { kind: "new" }), { kind: "error", reason: "timeout" }),
    ]);

    expect(summary).toMatchObject({ total: 6, errors: 1, evaluated: 5, passed: 2, caseAccuracy: 2 / 5 });
    expect(summary.duplicate).toEqual({
      truePositives: 1,
      falsePositives: 2,
      falseNegatives: 2,
      precision: 1 / 3,
      recall: 1 / 3,
    });
  });

  it("reports undefined metrics as null instead of inventing a number", () => {
    const summary = summarize([result(evalCase("tn", { kind: "new" }), analyzed(null))]);

    expect(summary.duplicate.precision).toBeNull();
    expect(summary.duplicate.recall).toBeNull();
    expect(summarize([]).caseAccuracy).toBeNull();
  });
});

describe("runTriageEval", () => {
  it("runs cases through the real Analyze path against the seeded backlog", async () => {
    const [first] = TRIAGE_EVAL_CASES;
    if (first.expected.kind !== "duplicate") throw new Error("first case should expect a duplicate");
    const model = new FakeTriageModel([
      {
        output: {
          problemStatement: "Repeating work has to be recreated by hand.",
          theme: "automation",
          themeRationale: "Automates a repeating task.",
          matches: [
            {
              requestId: first.expected.requestId,
              relationship: "duplicate",
              confidence: "high",
              sharedNeed: "Both want tasks to recur automatically.",
              differences: "Monthly rather than weekly.",
            },
          ],
          rubric: {
            severity: { score: 3, rationale: "Missed obligations." },
            strategicAlignment: { score: 5, rationale: "Automation.", goalIds: ["automate-repetitive-workflows"] },
            workaroundGap: { score: 4, rationale: "Manual reminders." },
          },
        },
      },
    ]);

    const [only] = await runTriageEval(model, [first]);

    expect(only.pass).toBe(true);
    expect(model.requests[0].prompt).toContain(first.expected.requestId);
  });
});
