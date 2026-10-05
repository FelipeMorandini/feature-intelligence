import { createHash } from "node:crypto";
import { z } from "zod";

export const TITLE_LIMITS = { min: 5, max: 120 } as const;
export const DESCRIPTION_LIMITS = { min: 20, max: 2000 } as const;

/** What a user submits. Validated before anything reaches the model. */
export const FeatureRequestInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(TITLE_LIMITS.min, `Title must be at least ${TITLE_LIMITS.min} characters.`)
    .max(TITLE_LIMITS.max),
  description: z
    .string()
    .trim()
    .min(
      DESCRIPTION_LIMITS.min,
      `Please describe the request in at least ${DESCRIPTION_LIMITS.min} characters.`,
    )
    .max(DESCRIPTION_LIMITS.max),
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
