import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { BacklogItem } from "@/requests/queries";
import { NotTriagedBadge, PriorityBadge, ThemeBadge } from "./badges";
import { SupportButton } from "./support-button";

export function RequestCard({ item }: { item: BacklogItem }) {
  return (
    <article className="flex gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-xs transition-colors hover:border-neutral-300 sm:p-5">
      <SupportButton
        requestId={item.id}
        requestTitle={item.title}
        supportCount={item.supportCount}
        supported={item.supportedByViewer}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <h2 className="text-base leading-snug font-semibold text-neutral-900">
            <Link href={`/requests/${item.id}`} className="hover:text-indigo-700 hover:underline">
              {item.title}
            </Link>
          </h2>
          <div className="shrink-0">
            <PriorityBadge priority={item.priority} />
          </div>
        </div>

        {item.problemStatement ? (
          <p className="mt-1.5 line-clamp-2 text-sm text-neutral-600">
            <span className="mr-1.5 text-xs font-semibold tracking-wide text-indigo-600 uppercase">Problem</span>
            {item.problemStatement}
          </p>
        ) : (
          <p className="mt-1.5 line-clamp-2 text-sm text-neutral-600">{item.description}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-neutral-500">
          {item.theme ? <ThemeBadge theme={item.theme} /> : <NotTriagedBadge />}
          <span>
            Submitted <time dateTime={item.createdAt.toISOString()}>{formatDate(item.createdAt)}</time>
          </span>
        </div>
      </div>
    </article>
  );
}
