import { describe, expect, it } from "vitest";
import { FeatureRequestInputSchema, hashTriageInput } from "./input";

const base = { title: "Dark mode", description: "Please add a dark theme for evening work." };

describe("FeatureRequestInputSchema", () => {
  it("trims input and rejects titles or descriptions that are too short", () => {
    expect(FeatureRequestInputSchema.parse({ ...base, title: "  Dark mode  " }).title).toBe("Dark mode");
    expect(FeatureRequestInputSchema.safeParse({ ...base, title: "Hi" }).success).toBe(false);
    expect(FeatureRequestInputSchema.safeParse({ ...base, description: "Too short" }).success).toBe(false);
  });
});

describe("hashTriageInput", () => {
  it("ignores whitespace differences", () => {
    expect(hashTriageInput({ title: " Dark   mode", description: "Please add a dark\ntheme for evening work. " })).toBe(
      hashTriageInput(base),
    );
  });

  it("changes when the wording changes", () => {
    expect(hashTriageInput({ ...base, description: "Please add a light theme for evening work." })).not.toBe(
      hashTriageInput(base),
    );
  });

  it("does not let text move between title and description unnoticed", () => {
    expect(hashTriageInput({ title: "ab", description: "c" })).not.toBe(
      hashTriageInput({ title: "a", description: "bc" }),
    );
  });
});
