import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getOrCreateVoterId } from "@/lib/voter";
import { supportRequest } from "@/requests/support";

// better-sqlite3 is a native module: this handler must run on Node.js.
export const runtime = "nodejs";

export async function POST(_request: Request, ctx: RouteContext<"/api/requests/[id]/support">) {
  const { id } = await ctx.params;
  const voterId = await getOrCreateVoterId();

  const result = supportRequest(getDb(), id, voterId);

  if (result.status === "not_found") {
    return NextResponse.json({ error: "Feature request not found." }, { status: 404 });
  }

  return NextResponse.json({
    supportCount: result.supportCount,
    alreadySupported: result.status === "already_supported",
  });
}
