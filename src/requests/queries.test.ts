import { beforeEach, describe, expect, it } from "vitest";
import { createMigratedMemoryDatabase, type AppDatabase } from "@/db/client";
import { featureRequests } from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import { SEED_FIXTURE_MODEL, SEED_REQUESTS } from "@/db/seed-data";
import { computePriority } from "@/domain/priority";
import { getRequestDetail, listBacklog, parseBacklogQuery, type BacklogQuery } from "./queries";
import { supportRequest } from "./support";

const query = (overrides: Partial<BacklogQuery> = {}): BacklogQuery => ({ q: "", sort: "priority", ...overrides });

describe("backlog read model", () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = createMigratedMemoryDatabase();
    seedDatabase(db);
  });

  it("derives priority from the current support count", () => {
    const seed = SEED_REQUESTS.find((request) => request.id === "seed-night-theme")!;
    const { rubric } = seed.enrichment;
    const scores = {
      severity: rubric.severity.score,
      strategicAlignment: rubric.strategicAlignment.score,
      workaroundGap: rubric.workaroundGap.score,
    };
    const before = getRequestDetail(db, seed.id, null)!;

    for (let voter = 0; voter < 6; voter++) supportRequest(db, seed.id, `voter-${voter}`);
    const after = getRequestDetail(db, seed.id, "voter-0")!;

    expect(before.priority).toEqual(computePriority(scores, seed.supportCount));
    expect(after.supportCount).toBe(seed.supportCount + 6);
    expect(after.priority).toEqual(computePriority(scores, seed.supportCount + 6));
    expect(after.priority!.score).toBeGreaterThan(before.priority!.score);
    expect(after.supportedByViewer).toBe(true);
    expect(before.supportedByViewer).toBe(false);
  });

  it("searches title and description case-insensitively", () => {
    const results = listBacklog(db, query({ q: "EYE STRAIN" }), null);

    // "eye strain" only appears in the night-theme description, not its title.
    expect(results.map((item) => item.id)).toEqual(["seed-night-theme"]);
  });

  it("filters by theme", () => {
    const results = listBacklog(db, query({ theme: "experience" }), null);

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((item) => item.theme?.id === "experience")).toBe(true);
  });

  it("sorts by priority, support count or recency", () => {
    const byPriority = listBacklog(db, query({ sort: "priority" }), null).map((item) => item.priority!.score);
    const bySupport = listBacklog(db, query({ sort: "supported" }), null).map((item) => item.supportCount);
    const byNewest = listBacklog(db, query({ sort: "newest" }), null).map((item) => item.createdAt.getTime());

    expect(byPriority).toEqual([...byPriority].sort((a, b) => b - a));
    expect(bySupport).toEqual([...bySupport].sort((a, b) => b - a));
    expect(byNewest).toEqual([...byNewest].sort((a, b) => b - a));
  });

  it("shows untriaged requests without inventing enrichment, after scored ones", () => {
    db.insert(featureRequests)
      .values({ id: "untriaged", title: "Gantt chart", description: "Please add a Gantt view.", triageStatus: "failed" })
      .run();

    const backlog = listBacklog(db, query(), null);
    const detail = getRequestDetail(db, "untriaged", null)!;

    expect(backlog.at(-1)?.id).toBe("untriaged");
    expect(detail).toMatchObject({ priority: null, theme: null, problemStatement: null, enrichment: null, provenance: null });
  });

  it("labels seed enrichment as a fixture in its provenance", () => {
    expect(getRequestDetail(db, "seed-dark-mode", null)?.provenance).toMatchObject({
      model: SEED_FIXTURE_MODEL,
      isSeedFixture: true,
    });
  });
});

describe("parseBacklogQuery", () => {
  it("falls back to defaults for unknown or missing values", () => {
    expect(parseBacklogQuery({ sort: "random", theme: "nope" })).toEqual({ q: "", sort: "priority", theme: undefined });
    expect(parseBacklogQuery({ q: ["  slack ", "ignored"], theme: "notifications", sort: "newest" })).toEqual({
      q: "slack",
      theme: "notifications",
      sort: "newest",
    });
  });
});
