import { RequestEnrichmentSchema, type TriageModelOutput } from "../triage/contract";
import { hashTriageInput } from "../triage/input";
import type { AppDatabase } from "./client";
import { featureRequests, supports, triageDecisions, triageRuns } from "./schema";
import { SEED_FIXTURE_MODEL, SEED_PROMPT_VERSION, SEED_REQUESTS } from "./seed-data";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Replaces all data with the seed backlog. Seed enrichment passes through the
 * same schema as model output, and each request gets a triage run labelled
 * SEED_FIXTURE_MODEL so its provenance stays visible.
 */
export function seedDatabase(db: AppDatabase, now: Date = new Date()): { requests: number; supports: number } {
  let supportTotal = 0;

  db.transaction((tx) => {
    tx.delete(triageDecisions).run();
    tx.delete(supports).run();
    tx.delete(featureRequests).run();
    tx.delete(triageRuns).run();

    for (const seed of SEED_REQUESTS) {
      const enrichment = RequestEnrichmentSchema.parse(seed.enrichment);
      const createdAt = new Date(now.getTime() - seed.daysAgo * DAY_MS);
      const runId = `${seed.id}-triage`;
      const validatedOutput: TriageModelOutput = { ...enrichment, matches: [] };

      tx.insert(triageRuns)
        .values({
          id: runId,
          inputTitle: seed.title,
          inputDescription: seed.description,
          inputHash: hashTriageInput(seed),
          candidateIds: [],
          model: SEED_FIXTURE_MODEL,
          promptVersion: SEED_PROMPT_VERSION,
          status: "succeeded",
          rawOutput: validatedOutput,
          validatedOutput,
          createdAt,
        })
        .run();

      tx.insert(featureRequests)
        .values({
          id: seed.id,
          title: seed.title,
          description: seed.description,
          triageStatus: "complete",
          triageRunId: runId,
          problemStatement: enrichment.problemStatement,
          theme: enrichment.theme,
          enrichment,
          createdAt,
        })
        .run();

      for (let index = 0; index < seed.supportCount; index++) {
        tx.insert(supports)
          .values({
            id: `${seed.id}-support-${index + 1}`,
            requestId: seed.id,
            voterId: `seed-voter-${index + 1}`,
            source: "direct",
            createdAt: new Date(createdAt.getTime() + (index + 1) * 60 * 60 * 1000),
          })
          .run();
        supportTotal++;
      }
    }
  });

  return { requests: SEED_REQUESTS.length, supports: supportTotal };
}
