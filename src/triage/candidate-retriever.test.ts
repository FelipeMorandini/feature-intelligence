import { beforeEach, describe, expect, it } from "vitest";
import { createMigratedMemoryDatabase, type AppDatabase } from "@/db/client";
import { featureRequests, supports } from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import { SEED_REQUESTS } from "@/db/seed-data";
import { AllOpenRequestsRetriever, DESCRIPTION_EXCERPT_LENGTH, truncateText } from "./candidate-retriever";

const input = { title: "Anything", description: "Retrieval ignores the input in the MVP." };

describe("AllOpenRequestsRetriever", () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = createMigratedMemoryDatabase();
  });

  it("returns original wording alongside existing enrichment", async () => {
    seedDatabase(db);

    const candidates = await new AllOpenRequestsRetriever(db).findCandidates(input);
    const darkMode = candidates.find((candidate) => candidate.id === "seed-dark-mode");

    expect(candidates).toHaveLength(SEED_REQUESTS.length);
    expect(darkMode).toMatchObject({
      title: "Dark mode",
      descriptionExcerpt: expect.stringContaining("bright white interface"),
      problemStatement: expect.any(String),
      theme: "experience",
    });
    // Most-supported first, so a bounded list keeps the highest-demand requests.
    expect(candidates[0].id).toBe("seed-dark-mode");
  });

  it("includes untriaged requests with null enrichment and truncates long descriptions", async () => {
    db.insert(featureRequests)
      .values({
        id: "untriaged",
        title: "Untriaged request",
        description: "word ".repeat(400),
        triageStatus: "failed",
      })
      .run();

    const [candidate] = await new AllOpenRequestsRetriever(db).findCandidates(input);

    expect(candidate).toMatchObject({ id: "untriaged", problemStatement: null, theme: null });
    expect(candidate.descriptionExcerpt.length).toBeLessThanOrEqual(DESCRIPTION_EXCERPT_LENGTH);
    expect(candidate.descriptionExcerpt.endsWith("…")).toBe(true);
  });

  it("is bounded, preferring the most supported requests", async () => {
    for (let index = 0; index < 8; index++) {
      db.insert(featureRequests)
        .values({ id: `req-${index}`, title: `Request ${index}`, description: "d", triageStatus: "failed" })
        .run();
    }
    db.insert(supports)
      .values([
        { id: "s1", requestId: "req-6", voterId: "v1", source: "direct" },
        { id: "s2", requestId: "req-6", voterId: "v2", source: "direct" },
        { id: "s3", requestId: "req-2", voterId: "v1", source: "direct" },
      ])
      .run();

    const candidates = await new AllOpenRequestsRetriever(db, 3).findCandidates(input);

    expect(candidates).toHaveLength(3);
    expect(candidates.slice(0, 2).map((candidate) => candidate.id)).toEqual(["req-6", "req-2"]);
  });
});

describe("truncateText", () => {
  it("leaves short text alone apart from whitespace", () => {
    expect(truncateText("  hello\n  world ", 50)).toBe("hello world");
  });

  it("cuts on a word boundary and adds an ellipsis", () => {
    expect(truncateText("the quick brown fox jumps over the lazy dog", 20)).toBe("the quick brown fox…");
  });
});
