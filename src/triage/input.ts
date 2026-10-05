import { createHash } from "node:crypto";
import { z } from "zod";

/** What a user submits. Validated before anything reaches the model. */
export const FeatureRequestInputSchema = z.object({
  title: z.string().trim().min(5, "Title must be at least 5 characters.").max(120),
  description: z
    .string()
    .trim()
    .min(20, "Please describe the request in at least 20 characters.")
    .max(2000),
});

export type FeatureRequestInput = z.infer<typeof FeatureRequestInputSchema>;

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Stable fingerprint of the text that was triaged. The Decide step compares it
 * with the submitted text so a decision cannot be applied to text the model
 * never saw. Only whitespace is normalized; wording and casing changes count.
 */
export function hashTriageInput(input: FeatureRequestInput): string {
  return createHash("sha256")
    .update(normalizeWhitespace(input.title))
    .update("\u0000")
    .update(normalizeWhitespace(input.description))
    .digest("hex");
}
