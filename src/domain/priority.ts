/**
 * Transparent priority rubric.
 *
 * The model scores three dimensions (1-5) and explains each one. Observed
 * demand comes from real supports. This module — never the model — combines
 * them into the final score and band, so the result is deterministic,
 * reproducible and recalculated as demand changes.
 */

export type ModelScoredDimension = "severity" | "strategicAlignment" | "workaroundGap";
export type RubricDimension = ModelScoredDimension | "observedDemand";

/** Integer scores from 1 (lowest) to 5 (highest) assigned by the model. */
export type ModelRubricScores = Record<ModelScoredDimension, number>;

export const MIN_MODEL_SCORE = 1;
export const MAX_MODEL_SCORE = 5;

/** Support count at which observed demand reaches its maximum contribution. */
export const DEMAND_SATURATION_SUPPORTS = 20;

interface DimensionDefinition {
  label: string;
  weight: number;
  source: "model" | "observed";
  question: string;
  anchors: { low: string; high: string };
}

export const PRIORITY_RUBRIC: Record<RubricDimension, DimensionDefinition> = {
  severity: {
    label: "Severity",
    weight: 0.3,
    source: "model",
    question: "How painful or blocking is the underlying problem for the people who have it?",
    anchors: {
      low: "1 = minor annoyance or cosmetic preference",
      high: "5 = blocks core work or causes significant lost time or errors",
    },
  },
  strategicAlignment: {
    label: "Strategic alignment",
    weight: 0.2,
    source: "model",
    question: "How directly would solving this advance the explicit product strategy goals?",
    anchors: {
      low: "1 = unrelated to any stated goal",
      high: "5 = directly and substantially advances at least one goal",
    },
  },
  workaroundGap: {
    label: "Workaround gap",
    weight: 0.2,
    source: "model",
    question: "How poor are the workarounds available today?",
    anchors: {
      low: "1 = an easy, adequate workaround already exists",
      high: "5 = no reasonable workaround exists",
    },
  },
  observedDemand: {
    label: "Observed demand",
    weight: 0.3,
    source: "observed",
    question: "How many people have supported this request?",
    anchors: {
      low: "0 supports contributes nothing",
      high: `${DEMAND_SATURATION_SUPPORTS}+ supports contributes the full weight`,
    },
  },
};

export const PRIORITY_BANDS = [
  { band: "high", label: "High", minScore: 65 },
  { band: "medium", label: "Medium", minScore: 40 },
  { band: "low", label: "Low", minScore: 0 },
] as const;

export type PriorityBand = (typeof PRIORITY_BANDS)[number]["band"];

export interface PriorityComponent {
  dimension: RubricDimension;
  label: string;
  source: "model" | "observed";
  weight: number;
  /** The 1-5 model score, or the support count for observed demand. */
  input: number;
  /** Input normalized to 0..1. */
  normalized: number;
  /** Contribution to the 0-100 score (weight × normalized × 100). */
  points: number;
}

export interface PriorityAssessment {
  /** Integer from 0 to 100. */
  score: number;
  band: PriorityBand;
  components: PriorityComponent[];
}

/** Maps a 1-5 model score linearly onto 0..1. */
export function normalizeModelScore(score: number): number {
  if (!Number.isInteger(score) || score < MIN_MODEL_SCORE || score > MAX_MODEL_SCORE) {
    throw new RangeError(
      `Rubric scores must be integers between ${MIN_MODEL_SCORE} and ${MAX_MODEL_SCORE}; received ${score}.`,
    );
  }
  return (score - MIN_MODEL_SCORE) / (MAX_MODEL_SCORE - MIN_MODEL_SCORE);
}

/**
 * Logarithmic normalization of support count onto 0..1:
 * min(1, log2(1 + supports) / log2(1 + DEMAND_SATURATION_SUPPORTS)).
 * Early supports matter most; the curve saturates so a pile-on cannot
 * outweigh every other dimension.
 */
export function normalizeObservedDemand(supportCount: number): number {
  if (!Number.isInteger(supportCount) || supportCount < 0) {
    throw new RangeError(`Support count must be a non-negative integer; received ${supportCount}.`);
  }
  return Math.min(1, Math.log2(1 + supportCount) / Math.log2(1 + DEMAND_SATURATION_SUPPORTS));
}

export function bandForScore(score: number): PriorityBand {
  const match = PRIORITY_BANDS.find((band) => score >= band.minScore);
  if (!match) throw new RangeError(`Priority score must be between 0 and 100; received ${score}.`);
  return match.band;
}

export function computePriority(
  scores: ModelRubricScores,
  supportCount: number,
): PriorityAssessment {
  const inputs: Record<RubricDimension, { input: number; normalized: number }> = {
    severity: { input: scores.severity, normalized: normalizeModelScore(scores.severity) },
    strategicAlignment: {
      input: scores.strategicAlignment,
      normalized: normalizeModelScore(scores.strategicAlignment),
    },
    workaroundGap: {
      input: scores.workaroundGap,
      normalized: normalizeModelScore(scores.workaroundGap),
    },
    observedDemand: { input: supportCount, normalized: normalizeObservedDemand(supportCount) },
  };

  const components = (Object.keys(PRIORITY_RUBRIC) as RubricDimension[]).map((dimension) => {
    const definition = PRIORITY_RUBRIC[dimension];
    const { input, normalized } = inputs[dimension];
    return {
      dimension,
      label: definition.label,
      source: definition.source,
      weight: definition.weight,
      input,
      normalized,
      points: definition.weight * normalized * 100,
    };
  });

  // The band is derived from the rounded score so the displayed number and
  // band can never disagree (e.g. "65 · Medium").
  const score = Math.round(components.reduce((total, component) => total + component.points, 0));

  return { score, band: bandForScore(score), components };
}
