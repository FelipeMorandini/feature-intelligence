import { randomUUID } from "node:crypto";
import { and, count, eq, isNull } from "drizzle-orm";
import type { AppDatabase, DbExecutor } from "@/db/client";
import { featureRequests, supports, type SupportSource } from "@/db/schema";

export type SupportResult =
  | { status: "supported" | "already_supported"; supportCount: number }
  | { status: "not_found" };

export function countSupports(db: DbExecutor, requestId: string): number {
  return db.select({ total: count() }).from(supports).where(eq(supports.requestId, requestId)).get()?.total ?? 0;
}

/**
 * Adds one support per (request, voter). A repeat is reported rather than
 * raised, and the unique index remains the source of truth. When a comment
 * (the supporter's own wording) is given and the existing support has none,
 * it is kept rather than lost.
 */
export function recordSupport(
  db: DbExecutor,
  support: { requestId: string; voterId: string; source: SupportSource; comment?: string },
): { alreadySupported: boolean } {
  const inserted = db
    .insert(supports)
    .values({ id: randomUUID(), ...support, comment: support.comment ?? null })
    .onConflictDoNothing({ target: [supports.requestId, supports.voterId] })
    .run();

  if (inserted.changes > 0) return { alreadySupported: false };

  if (support.comment) {
    db.update(supports)
      .set({ comment: support.comment })
      .where(
        and(eq(supports.requestId, support.requestId), eq(supports.voterId, support.voterId), isNull(supports.comment)),
      )
      .run();
  }
  return { alreadySupported: true };
}

/**
 * Records a direct support from the backlog or detail page. The returned
 * count is always read from the database, never taken from a client.
 */
export function supportRequest(db: AppDatabase, requestId: string, voterId: string): SupportResult {
  return db.transaction((tx) => {
    const request = tx
      .select({ id: featureRequests.id })
      .from(featureRequests)
      .where(eq(featureRequests.id, requestId))
      .get();
    if (!request) return { status: "not_found" } as const;

    const { alreadySupported } = recordSupport(tx, { requestId, voterId, source: "direct" });
    return {
      status: alreadySupported ? "already_supported" : "supported",
      supportCount: countSupports(tx, requestId),
    } as const;
  });
}
