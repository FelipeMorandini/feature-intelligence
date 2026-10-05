import Link from "next/link";
import { connection } from "next/server";
import { BacklogFilters } from "@/components/backlog-filters";
import { RequestCard } from "@/components/request-card";
import { getDb } from "@/db";
import { PRODUCT_STRATEGY } from "@/domain/product-strategy";
import { getTheme, THEMES } from "@/domain/themes";
import { pluralize } from "@/lib/format";
import { readVoterId } from "@/lib/voter";
import { countRequests, listBacklog, parseBacklogQuery, type BacklogSort } from "@/requests/queries";

const SORT_DESCRIPTIONS: Record<BacklogSort, string> = {
  priority: "highest priority first",
  supported: "most supported first",
  newest: "newest first",
};

export default async function BacklogPage({ searchParams }: PageProps<"/">) {
  // Request-time rendering: the backlog must reflect the live SQLite data,
  // never a snapshot taken at build time.
  await connection();

  const query = parseBacklogQuery(await searchParams);
  const db = getDb();
  const items = listBacklog(db, query, await readVoterId());
  const total = countRequests(db);
  const isFiltered = Boolean(query.q || query.theme);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Feature requests</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-600">
            What {PRODUCT_STRATEGY.productName} customers are asking for. Each request is triaged against a
            transparent rubric; priority is a signal for the product team, not a decision.{" "}
            <Link href="/how-it-works" className="font-medium text-indigo-700 hover:underline">
              How it works
            </Link>
          </p>
        </div>
      </div>

      <BacklogFilters
        // Remount when the URL changes so uncontrolled inputs reflect it (e.g. after "Clear").
        key={`${query.q}|${query.theme ?? ""}|${query.sort}`}
        q={query.q}
        theme={query.theme}
        sort={query.sort}
        themes={THEMES.map(({ id, label }) => ({ id, label }))}
        isFiltered={isFiltered}
      />

      <p className="text-sm text-neutral-500" aria-live="polite">
        {isFiltered
          ? `${pluralize(items.length, "request")} of ${total}`
          : pluralize(items.length, "request")}
        {query.theme && <> in {getTheme(query.theme).label}</>}
        {query.q && <> matching “{query.q}”</>}
        {items.length > 1 && <>, {SORT_DESCRIPTIONS[query.sort]}</>}
      </p>

      {items.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <RequestCard item={item} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState isFiltered={isFiltered} />
      )}
    </div>
  );
}

function EmptyState({ isFiltered }: { isFiltered: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-14 text-center">
      <h2 className="text-base font-semibold text-neutral-900">
        {isFiltered ? "No requests match these filters" : "No feature requests yet"}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
        {isFiltered
          ? "Try a different search or theme. If nobody has asked for this yet, submit it — triage will check for similar requests first."
          : "Submit the first request to start the backlog."}
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        {isFiltered && (
          <Link
            href="/"
            className="rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Clear filters
          </Link>
        )}
        <Link
          href="/requests/new"
          className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Submit request
        </Link>
      </div>
    </div>
  );
}
