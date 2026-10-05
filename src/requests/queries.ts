import { and, count, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/db/client";
import { featureRequests, supports, triageRuns } from "@/db/schema";
import { SEED_FIXTURE_MODEL } from "@/db/seed-data";
import { computePriority, type PriorityAssessment } from "@/domain/priority";
import { getTheme, THEME_IDS, type Theme } from "@/domain/themes";
import type { RequestEnrichment } from "@/triage/contract";

/**
 * Read model for the backlog and detail pages. Rows are mapped to view types
 * here so UI code never handles database shapes, and priority is always
 * derived from the current support count via the domain function.
 */

export const BACKLOG_SORTS = ["priority", "supported", "newest"] as const;
export type BacklogSort = (typeof BACKLOG_SORTS)[number];

export const BacklogQuerySchema = z.object({
  q: z.string().trim().max(200).catch(""),
  theme: z.enum(THEME_IDS).optional().catch(undefined),
  sort: z.enum(BACKLOG_SORTS).catch("priority"),
});

export type BacklogQuery = z.infer<typeof BacklogQuerySchema>;

/** Parses URL search params leniently: unknown values fall back to defaults. */
export function parseBacklogQuery(
  searchParams: Record<string, string | string[] | undefined>,
): BacklogQuery {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return BacklogQuerySchema.parse({
    q: first(searchParams.q) ?? "",
    theme: first(searchParams.theme) || undefined,
    sort: first(searchParams.sort) ?? "priority",
  });
}

export interface BacklogItem {
  id: string;
  title: string;
  /** The submitter's original wording. */
  description: string;
  /** AI-extracted problem statement; null when the request is untriaged. */
  problemStatement: string | null;
  theme: Theme | null;
  supportCount: number;
  supportedByViewer: boolean;
  createdAt: Date;
  /** Null when the request is untriaged: there is nothing to score. */
  priority: PriorityAssessment | null;
}

export interface TriageProvenance {
  model: string;
  promptVersion: string;
  triagedAt: Date;
  /** True for hand-written demo enrichment, which must never pass as live model output. */
  isSeedFixture: boolean;
}

export interface RequestDetail extends BacklogItem {
  enrichment: RequestEnrichment | null;
  provenance: TriageProvenance | null;
}

function priorityFor(enrichment: RequestEnrichment | null, supportCount: number) {
  if (!enrichment) return null;
  const { rubric } = enrichment;
  return computePriority(
    {
      severity: rubric.severity.score,
      strategicAlignment: rubric.strategicAlignment.score,
      workaroundGap: rubric.workaroundGap.score,
    },
    supportCount,
  );
}

function selectRequests(db: AppDatabase, voterId: string | null, where?: SQL) {
  return db
    .select({
      id: featureRequests.id,
      title: featureRequests.title,
      description: featureRequests.description,
      problemStatement: featureRequests.problemStatement,
      theme: featureRequests.theme,
      enrichment: featureRequests.enrichment,
      createdAt: featureRequests.createdAt,
      supportCount: count(supports.id),
      viewerSupports: voterId
        ? sql<number>`coalesce(sum(case when ${supports.voterId} = ${voterId} then 1 else 0 end), 0)`
        : sql<number>`0`,
      triageModel: triageRuns.model,
      triagePromptVersion: triageRuns.promptVersion,
      triagedAt: triageRuns.createdAt,
    })
    .from(featureRequests)
    .leftJoin(supports, eq(supports.requestId, featureRequests.id))
    .leftJoin(triageRuns, eq(triageRuns.id, featureRequests.triageRunId))
    .where(where)
    .groupBy(featureRequests.id);
}

type RequestRow = ReturnType<ReturnType<typeof selectRequests>["all"]>[number];

function toBacklogItem(row: RequestRow): BacklogItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    problemStatement: row.problemStatement,
    theme: row.theme ? getTheme(row.theme) : null,
    supportCount: row.supportCount,
    supportedByViewer: row.viewerSupports > 0,
    createdAt: row.createdAt,
    priority: priorityFor(row.enrichment, row.supportCount),
  };
}

const byNewest = (a: BacklogItem, b: BacklogItem) => b.createdAt.getTime() - a.createdAt.getTime();
// Untriaged requests have no score and sort after every scored request.
const byPriority = (a: BacklogItem, b: BacklogItem) => (b.priority?.score ?? -1) - (a.priority?.score ?? -1);
const bySupports = (a: BacklogItem, b: BacklogItem) => b.supportCount - a.supportCount;

const COMPARATORS: Record<BacklogSort, Array<(a: BacklogItem, b: BacklogItem) => number>> = {
  priority: [byPriority, bySupports, byNewest],
  supported: [bySupports, byPriority, byNewest],
  newest: [byNewest],
};

/**
 * Lists the backlog. Search and theme filtering happen in SQL; sorting happens
 * after priority is computed, because priority is derived in code rather than
 * stored. That is fine at MVP scale; a large backlog would persist a
 * recomputed score for indexed sorting.
 */
export function listBacklog(db: AppDatabase, query: BacklogQuery, voterId: string | null): BacklogItem[] {
  const conditions: SQL[] = [];
  if (query.theme) conditions.push(eq(featureRequests.theme, query.theme));
  if (query.q) {
    // instr() avoids LIKE wildcard escaping; lower() makes it case-insensitive.
    const needle = query.q.toLowerCase();
    conditions.push(
      sql`(instr(lower(${featureRequests.title}), ${needle}) > 0 or instr(lower(${featureRequests.description}), ${needle}) > 0)`,
    );
  }

  const items = selectRequests(db, voterId, and(...conditions))
    .all()
    .map(toBacklogItem);

  const comparators = COMPARATORS[query.sort];
  return items.sort((a, b) => {
    for (const compare of comparators) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return a.id.localeCompare(b.id);
  });
}

export function getRequestDetail(db: AppDatabase, id: string, voterId: string | null): RequestDetail | null {
  const row = selectRequests(db, voterId, eq(featureRequests.id, id)).get();
  if (!row) return null;

  return {
    ...toBacklogItem(row),
    enrichment: row.enrichment,
    // Provenance describes enrichment; an untriaged request has none to attribute.
    provenance:
      row.enrichment && row.triageModel && row.triagePromptVersion && row.triagedAt
        ? {
            model: row.triageModel,
            promptVersion: row.triagePromptVersion,
            triagedAt: row.triagedAt,
            isSeedFixture: row.triageModel === SEED_FIXTURE_MODEL,
          }
        : null,
  };
}

export function countRequests(db: AppDatabase): number {
  return db.select({ total: count() }).from(featureRequests).get()?.total ?? 0;
}
