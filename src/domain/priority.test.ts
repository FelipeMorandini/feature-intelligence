import { describe, expect, it } from "vitest";
import {
  bandForScore,
  computePriority,
  normalizeObservedDemand,
  PRIORITY_RUBRIC,
  type ModelRubricScores,
} from "./priority";

const scores = (severity: number, strategicAlignment: number, workaroundGap: number): ModelRubricScores => ({
  severity,
  strategicAlignment,
  workaroundGap,
});

describe("priority rubric", () => {
  it("has weights that sum to exactly 100%", () => {
    const total = Object.values(PRIORITY_RUBRIC).reduce((sum, dimension) => sum + dimension.weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("only lets the model score severity, strategic alignment and workaround gap", () => {
    const modelScored = Object.entries(PRIORITY_RUBRIC)
      .filter(([, dimension]) => dimension.source === "model")
      .map(([key]) => key);
    expect(modelScored.sort()).toEqual(["severity", "strategicAlignment", "workaroundGap"]);
    expect(PRIORITY_RUBRIC.observedDemand.source).toBe("observed");
  });
});

describe("normalizeObservedDemand", () => {
  it("follows min(1, log2(1 + supports) / log2(21))", () => {
    expect(normalizeObservedDemand(0)).toBe(0);
    expect(normalizeObservedDemand(1)).toBeCloseTo(1 / Math.log2(21), 10);
    expect(normalizeObservedDemand(3)).toBeCloseTo(2 / Math.log2(21), 10);
    expect(normalizeObservedDemand(20)).toBe(1);
  });

  it("increases with each support and saturates at 20", () => {
    const values = Array.from({ length: 21 }, (_, supports) => normalizeObservedDemand(supports));
    for (let index = 1; index < values.length; index++) {
      expect(values[index]).toBeGreaterThan(values[index - 1]);
    }
    expect(normalizeObservedDemand(500)).toBe(1);
  });

  it.each([-1, 1.5, Number.NaN])("rejects an invalid support count (%s)", (supports) => {
    expect(() => normalizeObservedDemand(supports)).toThrow(RangeError);
  });
});

describe("computePriority", () => {
  it("scores the extremes as 0 and 100", () => {
    expect(computePriority(scores(1, 1, 1), 0)).toMatchObject({ score: 0, band: "low" });
    expect(computePriority(scores(5, 5, 5), 20)).toMatchObject({ score: 100, band: "high" });
  });

  it("combines weighted dimensions deterministically", () => {
    // severity 4 → 0.75 × 30 = 22.5
    // alignment 3 → 0.5 × 20 = 10
    // workaround 2 → 0.25 × 20 = 5
    // demand 3 supports → (2 / log2 21) × 30 ≈ 13.66
    const result = computePriority(scores(4, 3, 2), 3);

    expect(result.score).toBe(51);
    expect(result.band).toBe("medium");
    expect(result.components.map((component) => [component.dimension, component.input])).toEqual([
      ["severity", 4],
      ["strategicAlignment", 3],
      ["workaroundGap", 2],
      ["observedDemand", 3],
    ]);
    expect(result.components.find((c) => c.dimension === "observedDemand")?.points).toBeCloseTo(
      (2 / Math.log2(21)) * 30,
      10,
    );
  });

  it("rises as supports accumulate while model scores stay fixed", () => {
    const fewSupports = computePriority(scores(3, 3, 3), 1).score;
    const manySupports = computePriority(scores(3, 3, 3), 15).score;
    expect(manySupports).toBeGreaterThan(fewSupports);
  });

  it.each([0, 6, 2.5])("rejects a model score outside the 1-5 integer scale (%s)", (invalid) => {
    expect(() => computePriority(scores(invalid, 3, 3), 0)).toThrow(RangeError);
  });
});

describe("bandForScore", () => {
  it.each([
    [100, "high"],
    [65, "high"],
    [64, "medium"],
    [40, "medium"],
    [39, "low"],
    [0, "low"],
  ] as const)("maps %i to %s", (score, band) => {
    expect(bandForScore(score)).toBe(band);
  });

  it("keeps the band consistent with the displayed (rounded) score", () => {
    for (let supports = 0; supports <= 25; supports++) {
      for (const severity of [1, 2, 3, 4, 5]) {
        const result = computePriority(scores(severity, 4, 3), supports);
        expect(result.band).toBe(bandForScore(result.score));
      }
    }
  });
});
