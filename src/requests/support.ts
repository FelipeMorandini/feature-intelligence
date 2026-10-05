import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { featureRequests, supports } from "@/db/schema";

export type SupportResult =
  | { status: "supported" | "already_supported"; supportCount: number }
  | { status: "not_found" };

/**
 * Records a direct support. Idempotent per (request, voter): the unique index
 * is the source of truth, and a repeat is reported rather than raised. The
 * returned count is always read from the database, never taken from a client.
 */
export function supportRequest(db: AppDatabase, requestId: string, voterId: string): SupportResult {
  return db.transaction((tx) => {
    const request = tx
      .select({ id: featureRequests.id })
      .from(featureRequests)
      .where(eq(featureRequests.id, requestId))
      .get();
    if (!request) return { status: "not_found" } as const;

    const inserted = tx
      .insert(supports)
      .values({ id: randomUUID(), requestId, voterId, source: "direct" })
      .onConflictDoNothing({ target: [supports.requestId, supports.voterId] })
      .run();

    const supportCount =
      tx.select({ total: count() }).from(supports).where(eq(supports.requestId, requestId)).get()?.total ?? 0;

    return {
      status: inserted.changes > 0 ? "supported" : "already_supported",
      supportCount,
    } as const;
  });
}
