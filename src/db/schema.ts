import { sql, type SQL } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
// Relative imports keep this file loadable by drizzle-kit, which does not
// resolve the "@/..." path alias.
import { THEME_IDS } from "../domain/themes";
import type { RequestEnrichment, TriageModelOutput } from "../triage/contract";

export const TRIAGE_STATUSES = ["complete", "failed"] as const;
export const TRIAGE_RUN_STATUSES = [
  "succeeded",
  "invalid_output",
  "provider_error",
  "unavailable",
] as const;
export const TRIAGE_DECISIONS = ["supported_existing", "created_new"] as const;
export const MATCH_CONFIDENCES = ["high", "medium", "low"] as const;
export const SUPPORT_SOURCES = ["direct", "duplicate_redirect"] as const;

export type TriageStatus = (typeof TRIAGE_STATUSES)[number];
export type TriageRunStatus = (typeof TRIAGE_RUN_STATUSES)[number];
export type TriageDecisionKind = (typeof TRIAGE_DECISIONS)[number];
export type SupportSource = (typeof SUPPORT_SOURCES)[number];

/** Restricts a text column to a fixed set of values at the database level. */
function oneOf(column: AnySQLiteColumn, values: readonly string[]): SQL {
  const list = values.map((value) => `'${value}'`).join(", ");
  return sql`${column} in (${sql.raw(list)})`;
}

const id = () => text("id").primaryKey();
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

/**
 * Audit trail of every triage attempt — including failures — with exactly
 * what the model saw (candidate ids, prompt version) and what it returned
 * before and after validation.
 */
export const triageRuns = sqliteTable(
  "triage_runs",
  {
    id: id(),
    inputTitle: text("input_title").notNull(),
    inputDescription: text("input_description").notNull(),
    inputHash: text("input_hash").notNull(),
    candidateIds: text("candidate_ids", { mode: "json" }).$type<string[]>().notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    status: text("status", { enum: TRIAGE_RUN_STATUSES }).notNull(),
    rawOutput: text("raw_output", { mode: "json" }).$type<unknown>(),
    validatedOutput: text("validated_output", { mode: "json" }).$type<TriageModelOutput>(),
    error: text("error"),
    latencyMs: integer("latency_ms"),
    createdAt: createdAt(),
  },
  (table) => [
    check("triage_runs_status_check", oneOf(table.status, TRIAGE_RUN_STATUSES)),
    check(
      "triage_runs_validated_output_check",
      sql`(${table.status} = 'succeeded') = (${table.validatedOutput} is not null)`,
    ),
  ],
);

export const featureRequests = sqliteTable(
  "feature_requests",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    triageStatus: text("triage_status", { enum: TRIAGE_STATUSES }).notNull(),
    triageRunId: text("triage_run_id").references(() => triageRuns.id),
    problemStatement: text("problem_statement"),
    theme: text("theme", { enum: THEME_IDS }),
    enrichment: text("enrichment", { mode: "json" }).$type<RequestEnrichment>(),
    createdAt: createdAt(),
  },
  (table) => [
    index("feature_requests_theme_idx").on(table.theme),
    // One analysis can produce at most one request (NULLs are not compared).
    uniqueIndex("feature_requests_triage_run_unique").on(table.triageRunId),
    index("feature_requests_created_at_idx").on(table.createdAt),
    check("feature_requests_triage_status_check", oneOf(table.triageStatus, TRIAGE_STATUSES)),
    check("feature_requests_theme_check", sql`${table.theme} is null or ${oneOf(table.theme, THEME_IDS)}`),
    // A request is either fully enriched or explicitly untriaged — never half.
    check(
      "feature_requests_enrichment_check",
      sql`(${table.triageStatus} = 'complete'
            and ${table.problemStatement} is not null
            and ${table.theme} is not null
            and ${table.enrichment} is not null)
          or (${table.triageStatus} = 'failed'
            and ${table.problemStatement} is null
            and ${table.theme} is null
            and ${table.enrichment} is null)`,
    ),
  ],
);

/**
 * The human decision taken when triage proposed a probable duplicate. AI never
 * consolidates requests on its own; this table records what the AI suggested
 * and what the person chose (overrides double as evaluation labels).
 */
export const triageDecisions = sqliteTable(
  "triage_decisions",
  {
    id: id(),
    triageRunId: text("triage_run_id")
      .notNull()
      .references(() => triageRuns.id),
    suggestedRequestId: text("suggested_request_id")
      .notNull()
      .references(() => featureRequests.id),
    aiConfidence: text("ai_confidence", { enum: MATCH_CONFIDENCES }).notNull(),
    decision: text("decision", { enum: TRIAGE_DECISIONS }).notNull(),
    /** The supported request, or the newly created one. */
    resultingRequestId: text("resulting_request_id")
      .notNull()
      .references(() => featureRequests.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("triage_decisions_run_unique").on(table.triageRunId),
    check("triage_decisions_decision_check", oneOf(table.decision, TRIAGE_DECISIONS)),
    check("triage_decisions_confidence_check", oneOf(table.aiConfidence, MATCH_CONFIDENCES)),
  ],
);

export const supports = sqliteTable(
  "supports",
  {
    id: id(),
    requestId: text("request_id")
      .notNull()
      .references(() => featureRequests.id),
    /** Anonymous per-browser identifier; there are no accounts in the MVP. */
    voterId: text("voter_id").notNull(),
    /** The supporter's own wording, kept when they were redirected from a duplicate. */
    comment: text("comment"),
    source: text("source", { enum: SUPPORT_SOURCES }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("supports_request_voter_unique").on(table.requestId, table.voterId),
    check("supports_source_check", oneOf(table.source, SUPPORT_SOURCES)),
  ],
);

export type FeatureRequestRow = typeof featureRequests.$inferSelect;
export type NewFeatureRequestRow = typeof featureRequests.$inferInsert;
export type TriageRunRow = typeof triageRuns.$inferSelect;
export type NewTriageRunRow = typeof triageRuns.$inferInsert;
export type TriageDecisionRow = typeof triageDecisions.$inferSelect;
export type SupportRow = typeof supports.$inferSelect;
