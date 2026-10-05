import { z } from "zod";
import { MAX_MODEL_SCORE, MIN_MODEL_SCORE } from "@/domain/priority";
import { STRATEGY_GOAL_IDS } from "@/domain/product-strategy";
import { THEME_IDS } from "@/domain/themes";

/**
 * The structured output contract for request triage.
 *
 * Model output is untrusted until it passes this schema AND the semantic
 * checks in `validateTriageOutput`. The model interprets and recommends; it
 * never computes the final priority, chooses persistence, or merges requests.
 */

export const MAX_MATCHES = 3;

const shortText = (max: number) => z.string().trim().min(1).max(max);

const RubricScoreSchema = z.object({
  score: z.int().min(MIN_MODEL_SCORE).max(MAX_MODEL_SCORE),
  rationale: shortText(400),
});

export const MatchRelationshipSchema = z.enum(["duplicate", "related"]);
export const MatchConfidenceSchema = z.enum(["high", "medium", "low"]);

export type MatchRelationship = z.infer<typeof MatchRelationshipSchema>;
export type MatchConfidence = z.infer<typeof MatchConfidenceSchema>;

export const TriageMatchSchema = z.object({
  requestId: z.string().min(1),
  relationship: MatchRelationshipSchema,
  confidence: MatchConfidenceSchema,
  /** Why the two requests express the same (or overlapping) underlying need. */
  sharedNeed: shortText(400),
  /** What is distinct: scope, persona, surface, outcome. */
  differences: shortText(400),
});

export type TriageMatch = z.infer<typeof TriageMatchSchema>;

export const TriageRubricSchema = z.object({
  severity: RubricScoreSchema,
  strategicAlignment: RubricScoreSchema.extend({
    /** Which explicit strategy goals the request advances (may be empty). */
    goalIds: z.array(z.enum(STRATEGY_GOAL_IDS)).max(STRATEGY_GOAL_IDS.length),
  }),
  workaroundGap: RubricScoreSchema,
});

export type TriageRubric = z.infer<typeof TriageRubricSchema>;

export const TriageModelOutputSchema = z.object({
  problemStatement: shortText(400),
  theme: z.enum(THEME_IDS),
  themeRationale: shortText(300),
  matches: z.array(TriageMatchSchema),
  rubric: TriageRubricSchema,
});

export type TriageModelOutput = z.infer<typeof TriageModelOutputSchema>;

/** JSON Schema handed to the provider's structured-output mode. */
export const triageOutputJsonSchema = z.toJSONSchema(TriageModelOutputSchema);

/**
 * The enrichment persisted on a feature request. Matches are deliberately not
 * part of it: they belong to the triage run and the human decision, not to the
 * request's long-lived record.
 */
export const RequestEnrichmentSchema = TriageModelOutputSchema.pick({
  problemStatement: true,
  theme: true,
  themeRationale: true,
  rubric: true,
});

export type RequestEnrichment = z.infer<typeof RequestEnrichmentSchema>;

export type TriageValidationResult =
  | {
      ok: true;
      output: TriageModelOutput;
      /** Match ids the model returned that were not in the candidate set. */
      droppedMatchIds: string[];
    }
  | { ok: false; issues: z.core.$ZodIssue[]; message: string };

const RELATIONSHIP_RANK: Record<MatchRelationship, number> = { duplicate: 0, related: 1 };
const CONFIDENCE_RANK: Record<MatchConfidence, number> = { high: 0, medium: 1, low: 2 };

function compareMatches(a: TriageMatch, b: TriageMatch): number {
  return (
    RELATIONSHIP_RANK[a.relationship] - RELATIONSHIP_RANK[b.relationship] ||
    CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence]
  );
}

/**
 * Schema-validates raw model output, then applies referential checks:
 * - matches must reference a request that was actually offered as a candidate
 *   (hallucinated ids are dropped, not trusted);
 * - each request is matched at most once (first occurrence wins);
 * - at most MAX_MATCHES are kept, strongest first.
 *
 * Structural failures reject the whole output; we never persist partial
 * enrichment.
 */
export function validateTriageOutput(
  raw: unknown,
  candidateIds: ReadonlySet<string>,
): TriageValidationResult {
  const parsed = TriageModelOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues, message: z.prettifyError(parsed.error) };
  }

  const droppedMatchIds: string[] = [];
  const seen = new Set<string>();
  const matches: TriageMatch[] = [];

  for (const match of parsed.data.matches) {
    if (!candidateIds.has(match.requestId)) {
      droppedMatchIds.push(match.requestId);
      continue;
    }
    if (seen.has(match.requestId)) continue;
    seen.add(match.requestId);
    matches.push(match);
  }

  const output: TriageModelOutput = {
    ...parsed.data,
    rubric: {
      ...parsed.data.rubric,
      strategicAlignment: {
        ...parsed.data.rubric.strategicAlignment,
        goalIds: [...new Set(parsed.data.rubric.strategicAlignment.goalIds)],
      },
    },
    matches: matches.sort(compareMatches).slice(0, MAX_MATCHES),
  };

  return { ok: true, output, droppedMatchIds };
}

/** Confidence levels at which a duplicate must go to the human decision step. */
export const DECISION_REQUIRED_CONFIDENCES: readonly MatchConfidence[] = ["high", "medium"];

/**
 * Probable duplicates that require a human decision before anything is
 * created. "Related" matches and low-confidence duplicates are informational.
 */
export function getProbableDuplicates(output: TriageModelOutput): TriageMatch[] {
  return output.matches.filter(
    (match) =>
      match.relationship === "duplicate" && DECISION_REQUIRED_CONFIDENCES.includes(match.confidence),
  );
}

export function toRequestEnrichment(output: TriageModelOutput): RequestEnrichment {
  return {
    problemStatement: output.problemStatement,
    theme: output.theme,
    themeRationale: output.themeRationale,
    rubric: output.rubric,
  };
}
