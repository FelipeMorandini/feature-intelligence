import { beforeEach, describe, expect, it } from "vitest";
import { createMigratedMemoryDatabase, type AppDatabase } from "@/db/client";
import { seedDatabase } from "@/db/seed";
import { SEED_REQUESTS } from "@/db/seed-data";
import { supportRequest } from "./support";

const nightTheme = SEED_REQUESTS.find((seed) => seed.id === "seed-night-theme")!;

describe("supportRequest", () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = createMigratedMemoryDatabase();
    seedDatabase(db);
  });

  it("is idempotent for the same voter and request", () => {
    const first = supportRequest(db, nightTheme.id, "voter-1");
    const repeat = supportRequest(db, nightTheme.id, "voter-1");

    expect(first).toEqual({ status: "supported", supportCount: nightTheme.supportCount + 1 });
    expect(repeat).toEqual({ status: "already_supported", supportCount: nightTheme.supportCount + 1 });
  });

  it("counts different voters separately", () => {
    supportRequest(db, nightTheme.id, "voter-1");

    expect(supportRequest(db, nightTheme.id, "voter-2")).toEqual({
      status: "supported",
      supportCount: nightTheme.supportCount + 2,
    });
  });

  it("reports unknown requests instead of failing on the foreign key", () => {
    expect(supportRequest(db, "does-not-exist", "voter-1")).toEqual({ status: "not_found" });
  });
});
