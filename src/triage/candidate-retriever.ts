import { count, desc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { featureRequests, supports } from "@/db/schema";
import type { ThemeId } from "@/domain/themes";
import type { FeatureRequestInput } from "./input";

/** An existing request offered to the model for duplicate comparison. */
export interface TriageCandidate {
  id: string;
  title: string;
  /**
   * The user's original wording, truncated. Comparison is grounded in what
   * people actually wrote, not only in earlier AI summaries.
   */
  descriptionExcerpt: string;
  /** Earlier AI-extracted problem statement; null for untriaged requests. */
  problemStatement: string | null;
  theme: ThemeId | null;
}

/**
 * Chooses which existing requests the model compares a submission against.
 *
 * MVP: AllOpenRequestsRetriever sends a bounded list to the LLM.
 * Production: a vector retriever embeds the submission and returns a
 * top-k semantic shortlist — the triage workflow does not change.
 */
export interface CandidateRetriever {
  findCandidates(input: FeatureRequestInput): Promise<TriageCandidate[]>;
}

export const MAX_CANDIDATES = 50;
export const DESCRIPTION_EXCERPT_LENGTH = 500;

/** Truncates on a word boundary and marks the cut with an ellipsis. */
export function truncateText(text: string, maxLength: number): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;

  // Reserve one character for the ellipsis. Looking one character past the
  // slice lets a cut that lands exactly on a word boundary keep that word.
  const slice = normalized.slice(0, maxLength - 1);
  const lastSpace = normalized.slice(0, maxLength).lastIndexOf(" ");
  const cut = lastSpace > maxLength * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

/**
 * Every request is open in the MVP (there is no close/ship workflow), so this
 * returns all requests up to a fixed bound. When the bound is hit, the most
 * supported requests are preferred — they are where a missed duplicate costs
 * the most — then the newest.
 */
export class AllOpenRequestsRetriever implements CandidateRetriever {
  constructor(
    private readonly db: AppDatabase,
    private readonly limit: number = MAX_CANDIDATES,
  ) {}

  async findCandidates(input: FeatureRequestInput): Promise<TriageCandidate[]> {
    // The MVP compares against every open request, so the submission is not
    // needed here. A semantic retriever would embed it to build a shortlist.
    void input;
    const supportCount = count(supports.id);

    const rows = this.db
      .select({
        id: featureRequests.id,
        title: featureRequests.title,
        description: featureRequests.description,
        problemStatement: featureRequests.problemStatement,
        theme: featureRequests.theme,
      })
      .from(featureRequests)
      .leftJoin(supports, eq(supports.requestId, featureRequests.id))
      .groupBy(featureRequests.id)
      .orderBy(desc(supportCount), desc(featureRequests.createdAt), featureRequests.id)
      .limit(this.limit)
      .all();

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      descriptionExcerpt: truncateText(row.description, DESCRIPTION_EXCERPT_LENGTH),
      problemStatement: row.problemStatement,
      theme: row.theme,
    }));
  }
}
