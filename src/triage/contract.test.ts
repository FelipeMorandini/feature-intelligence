import { describe, expect, it } from "vitest";
import {
  getProbableDuplicates,
  MAX_MATCHES,
  validateTriageOutput,
  type TriageMatch,
} from "./contract";

const candidateIds = new Set(["req-a", "req-b", "req-c", "req-d"]);

function match(overrides: Partial<TriageMatch> = {}): TriageMatch {
  return {
    requestId: "req-a",
    relationship: "duplicate",
    confidence: "high",
    sharedNeed: "Both want to be alerted in chat when work is assigned.",
    differences: "One mentions due dates as well.",
    ...overrides,
  };
}

function validOutput(overrides: Record<string, unknown> = {}) {
  return {
    problemStatement: "People miss new assignments because alerts only appear in the product.",
    theme: "notifications",
    themeRationale: "About alerting people to assignments.",
    matches: [match()],
    rubric: {
      severity: { score: 4, rationale: "Missed work causes delays." },
      strategicAlignment: {
        score: 4,
        rationale: "Reduces status-chasing.",
        goalIds: ["reduce-coordination-work"],
      },
      workaroundGap: { score: 3, rationale: "Email exists but is missed." },
    },
    ...overrides,
  };
}

describe("validateTriageOutput", () => {
  it("accepts well-formed output that only references candidates", () => {
    const result = validateTriageOutput(validOutput(), candidateIds);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.matches).toHaveLength(1);
    expect(result.droppedMatchIds).toEqual([]);
  });

  it("drops matches that reference requests outside the candidate set", () => {
    const raw = validOutput({
      matches: [match({ requestId: "req-invented" }), match({ requestId: "req-b" })],
    });

    const result = validateTriageOutput(raw, candidateIds);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.matches.map((m) => m.requestId)).toEqual(["req-b"]);
    expect(result.droppedMatchIds).toEqual(["req-invented"]);
  });

  it("keeps the strongest match per request and at most MAX_MATCHES, strongest first", () => {
    const raw = validOutput({
      matches: [
        match({ requestId: "req-a", relationship: "related", confidence: "high" }),
        match({ requestId: "req-a", relationship: "duplicate", confidence: "high" }),
        match({ requestId: "req-b", relationship: "duplicate", confidence: "low" }),
        match({ requestId: "req-c", relationship: "duplicate", confidence: "medium" }),
        match({ requestId: "req-d", relationship: "related", confidence: "medium" }),
      ],
    });

    const result = validateTriageOutput(raw, candidateIds);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.matches).toHaveLength(MAX_MATCHES);
    expect(result.output.matches.map((m) => [m.requestId, m.relationship, m.confidence])).toEqual([
      ["req-a", "duplicate", "high"],
      ["req-c", "duplicate", "medium"],
      ["req-b", "duplicate", "low"],
    ]);
  });

  it("never lets an earlier related entry hide a duplicate of the same request", () => {
    const result = validateTriageOutput(
      validOutput({
        matches: [
          match({ requestId: "req-a", relationship: "related", confidence: "high" }),
          match({ requestId: "req-a", relationship: "duplicate", confidence: "medium" }),
        ],
      }),
      candidateIds,
    );
    if (!result.ok) throw new Error(result.message);

    expect(result.output.matches).toEqual([expect.objectContaining({ requestId: "req-a", relationship: "duplicate" })]);
    expect(getProbableDuplicates(result.output).map((m) => m.requestId)).toEqual(["req-a"]);
  });

  it.each([
    ["an unknown theme", validOutput({ theme: "blockchain" })],
    [
      "a score outside 1-5",
      validOutput({
        rubric: { ...validOutput().rubric, severity: { score: 7, rationale: "Very bad." } },
      }),
    ],
    [
      "a non-integer score",
      validOutput({
        rubric: { ...validOutput().rubric, workaroundGap: { score: 2.5, rationale: "Partial." } },
      }),
    ],
    [
      "an unknown strategy goal",
      validOutput({
        rubric: {
          ...validOutput().rubric,
          strategicAlignment: { score: 5, rationale: "Synergy.", goalIds: ["world-domination"] },
        },
      }),
    ],
    ["a missing problem statement", validOutput({ problemStatement: undefined })],
    ["an empty rationale", validOutput({ themeRationale: "   " })],
    ["an invalid relationship", validOutput({ matches: [match({ relationship: "same" as never })] })],
    ["a plain string", "Looks like a duplicate of req-a to me!"],
    ["null", null],
  ])("rejects output with %s", (_label, raw) => {
    const result = validateTriageOutput(raw, candidateIds);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("does not let the model supply its own priority score or band", () => {
    const result = validateTriageOutput(validOutput({ priorityScore: 99, band: "high" }), candidateIds);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).not.toHaveProperty("priorityScore");
    expect(result.output).not.toHaveProperty("band");
  });
});

describe("strategic alignment consistency", () => {
  const withAlignment = (score: number, goalIds: string[]) =>
    validOutput({
      rubric: { ...validOutput().rubric, strategicAlignment: { score, rationale: "Fits the strategy.", goalIds } },
    });
  const ONE_GOAL = ["reduce-coordination-work"];
  const TWO_GOALS = ["reduce-coordination-work", "cross-team-visibility"];

  it.each([
    [1, [], true],
    [1, ONE_GOAL, false],
    [2, [], true],
    [2, ONE_GOAL, true],
    [2, TWO_GOALS, false],
    [3, [], false],
    [3, ONE_GOAL, true],
    [5, [], false],
    [5, TWO_GOALS, true],
  ])("score %i with %j goal ids is valid: %s", (score, goalIds, valid) => {
    const result = validateTriageOutput(withAlignment(score, goalIds), candidateIds);

    expect(result.ok).toBe(valid);
    if (!result.ok) expect(result.message).toContain("goalIds");
  });

  it("counts repeated goal ids once", () => {
    expect(validateTriageOutput(withAlignment(2, [...ONE_GOAL, ...ONE_GOAL]), candidateIds).ok).toBe(true);
  });
});

describe("getProbableDuplicates", () => {
  it("requires a human decision only for high or medium confidence duplicates", () => {
    const result = validateTriageOutput(
      validOutput({
        matches: [
          match({ requestId: "req-a", relationship: "duplicate", confidence: "high" }),
          match({ requestId: "req-b", relationship: "duplicate", confidence: "low" }),
          match({ requestId: "req-c", relationship: "related", confidence: "high" }),
        ],
      }),
      candidateIds,
    );
    if (!result.ok) throw new Error(result.message);

    expect(getProbableDuplicates(result.output).map((m) => m.requestId)).toEqual(["req-a"]);
  });
});
