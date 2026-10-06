import { NextResponse } from "next/server";
import { resolveTriageModel } from "@/ai/provider";
import { getServerEnv } from "@/config/env";
import { getDb } from "@/db";
import { readVoterId } from "@/lib/voter";
import { AllOpenRequestsRetriever } from "@/triage/candidate-retriever";
import { analyzeSubmission } from "@/triage/triage-service";

// better-sqlite3 is a native module: this handler must run on Node.js.
export const runtime = "nodejs";

/**
 * Analyze: triages the submitted text and stores a triage run. It never
 * creates a feature request — that happens only after a human decision.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const db = getDb();

  const result = await analyzeSubmission(
    {
      db,
      retriever: new AllOpenRequestsRetriever(db),
      model: resolveTriageModel(getServerEnv()),
    },
    body,
    await readVoterId(),
  );

  return NextResponse.json(result, { status: result.status === "invalid_input" ? 400 : 200 });
}
