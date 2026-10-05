import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Anonymous per-browser identity used only to make supports idempotent.
 * There are no accounts; clearing cookies yields a new voter (a known MVP
 * tradeoff — production would tie supports to authenticated users).
 */
export const VOTER_COOKIE = "fi_voter";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isVoterId(value: string | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Reads the voter id in a Server Component. Never creates one. */
export async function readVoterId(): Promise<string | null> {
  const value = (await cookies()).get(VOTER_COOKIE)?.value;
  return isVoterId(value) ? value : null;
}

/** Reads or issues the voter id. Only callable where cookies can be set (Route Handlers). */
export async function getOrCreateVoterId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(VOTER_COOKIE)?.value;
  if (isVoterId(existing)) return existing;

  const voterId = randomUUID();
  store.set(VOTER_COOKIE, voterId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return voterId;
}
