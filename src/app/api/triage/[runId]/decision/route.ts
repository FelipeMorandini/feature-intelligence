import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getOrCreateVoterId } from "@/lib/voter";
import { decideTriage, type DecisionResult } from "@/triage/triage-service";

// better-sqlite3 is a native module: this handler must run on Node.js.
export const runtime = "nodejs";

const HTTP_STATUS: Record<DecisionResult["status"], number> = {
  created: 201,
  supported: 200,
  invalid_body: 400,
  invalid_target: 400,
  not_found: 404,
  stale_analysis: 409,
  decision_required: 409,
  already_decided: 409,
};

/**
 * Decide: performs the action a person chose after reviewing a triage run —
 * create the request, or support the proposed existing request.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/triage/[runId]/decision">) {
  const { runId } = await ctx.params;
  const body = await request.json().catch(() => null);

  const result = decideTriage(getDb(), runId, body, await getOrCreateVoterId());

  return NextResponse.json(result, { status: HTTP_STATUS[result.status] });
}
