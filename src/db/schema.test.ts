import { beforeEach, describe, expect, it } from "vitest";
import { computePriority } from "@/domain/priority";
import { createMigratedMemoryDatabase, type AppDatabase } from "./client";
import { featureRequests, supports } from "./schema";
import { seedDatabase } from "./seed";
import { SEED_REQUESTS } from "./seed-data";

describe("database integrity", () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = createMigratedMemoryDatabase();
  });

  it("rejects a request marked complete without enrichment", () => {
    expect(() =>
      db
        .insert(featureRequests)
        .values({ id: "half", title: "Half", description: "Half-enriched", triageStatus: "complete" })
        .run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it("allows only one support per voter per request", () => {
    seedDatabase(db);
    const support = { requestId: "seed-dark-mode", voterId: "browser-1", source: "direct" as const };

    db.insert(supports).values({ id: "first", ...support }).run();

    expect(() => db.insert(supports).values({ id: "second", ...support }).run()).toThrow(/UNIQUE/);
  });
});

describe("seed data", () => {
  it("seeds every request with validated enrichment and its supports", () => {
    const db = createMigratedMemoryDatabase();

    const result = seedDatabase(db);

    expect(result.requests).toBe(SEED_REQUESTS.length);
    expect(result.supports).toBe(SEED_REQUESTS.reduce((sum, seed) => sum + seed.supportCount, 0));
    expect(db.select().from(featureRequests).all().every((row) => row.triageStatus === "complete")).toBe(true);
  });

  it("produces a spread of priority bands for the demo", () => {
    const bands = new Set(
      SEED_REQUESTS.map((seed) => {
        const { rubric } = seed.enrichment;
        return computePriority(
          {
            severity: rubric.severity.score,
            strategicAlignment: rubric.strategicAlignment.score,
            workaroundGap: rubric.workaroundGap.score,
          },
          seed.supportCount,
        ).band;
      }),
    );

    expect(bands).toEqual(new Set(["high", "medium", "low"]));
  });
});
