import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { bandLabel, NotTriagedBadge, PriorityBadge, ThemeBadge } from "@/components/badges";
import { ArrowLeftIcon, SparkIcon } from "@/components/icons";
import { PriorityBreakdown } from "@/components/priority-breakdown";
import { SupportButton } from "@/components/support-button";
import { getDb } from "@/db";
import { formatDate, formatDateTime, pluralize } from "@/lib/format";
import { readVoterId } from "@/lib/voter";
import { getRequestDetail, type RequestDetail } from "@/requests/queries";

export async function generateMetadata({ params }: PageProps<"/requests/[id]">): Promise<Metadata> {
  await connection();
  const request = getRequestDetail(getDb(), (await params).id, null);
  return { title: request?.title ?? "Request not found" };
}

export default async function RequestDetailPage({ params }: PageProps<"/requests/[id]">) {
  // Request-time rendering: support counts and priority change after build.
  await connection();

  const { id } = await params;
  const request = getRequestDetail(getDb(), id, await readVoterId());
  if (!request) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
      >
        <ArrowLeftIcon className="size-4" />
        Back to backlog
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-neutral-500">
            {request.theme ? <ThemeBadge theme={request.theme} /> : <NotTriagedBadge />}
            <span>
              Submitted <time dateTime={request.createdAt.toISOString()}>{formatDate(request.createdAt)}</time>
            </span>
            <span>{pluralize(request.supportCount, "supporter")}</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance text-neutral-900">{request.title}</h1>
        </div>
        <div className="shrink-0">
          <SupportButton
            size="large"
            requestId={request.id}
            requestTitle={request.title}
            supportCount={request.supportCount}
            supported={request.supportedByViewer}
          />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Section title="Customer description" eyebrow="Original submission">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-neutral-800">{request.description}</p>
          </Section>

          <AiTriageSection request={request} />
        </div>

        <aside className="flex flex-col gap-6">
          <PrioritySummary request={request} />
        </aside>
      </div>
    </div>
  );
}

function Section({
  title,
  eyebrow,
  aside,
  children,
}: {
  title: string;
  eyebrow?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          {eyebrow && <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{eyebrow}</p>}
          <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function AiTriageSection({ request }: { request: RequestDetail }) {
  const { enrichment, provenance, priority } = request;

  if (!enrichment || !priority) {
    return (
      <Section title="AI triage" eyebrow="Not available">
        <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
          <p className="font-medium text-neutral-800">This request has not been triaged.</p>
          <p className="mt-1">
            AI triage was unavailable when it was submitted, so no problem statement, theme or priority has been
            inferred. Nothing has been filled in on the model&apos;s behalf. The request can still be found and
            supported.
          </p>
        </div>
      </Section>
    );
  }

  return (
    <Section
      title="AI triage"
      eyebrow="Interpretation and recommendation"
      aside={
        provenance?.isSeedFixture ? (
          <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-600/20 ring-inset">
            Seed fixture
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 ring-1 ring-violet-600/20 ring-inset">
            <SparkIcon className="size-3.5" />
            AI-generated
          </span>
        )
      }
    >
      <dl className="flex flex-col gap-5">
        <div>
          <dt className="text-xs font-semibold tracking-wide text-indigo-600 uppercase">Underlying problem</dt>
          <dd className="mt-1 text-sm text-neutral-900">{enrichment.problemStatement}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-indigo-600 uppercase">Theme</dt>
          <dd className="mt-1.5 flex flex-col items-start gap-1.5 text-sm text-neutral-600">
            <ThemeBadge theme={request.theme} />
            <span>{enrichment.themeRationale}</span>
          </dd>
        </div>
        <div>
          <dt className="mb-3 text-xs font-semibold tracking-wide text-indigo-600 uppercase">Priority breakdown</dt>
          <dd>
            <PriorityBreakdown priority={priority} rubric={enrichment.rubric} />
          </dd>
        </div>
      </dl>

      {provenance && (
        <div className="mt-6 rounded-lg bg-neutral-50 p-4">
          <h3 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Provenance</h3>
          <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-neutral-500">Model</dt>
              <dd className="font-mono text-xs text-neutral-900">{provenance.model}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Prompt version</dt>
              <dd className="font-mono text-xs text-neutral-900">{provenance.promptVersion}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Triaged</dt>
              <dd className="text-xs text-neutral-900">{formatDateTime(provenance.triagedAt)}</dd>
            </div>
          </dl>
          {provenance.isSeedFixture && (
            <p className="mt-3 text-xs text-amber-800">
              Hand-written demo data loaded by the seed script. It follows the same validated schema as model output
              but was not produced by a live Anthropic call.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

function PrioritySummary({ request }: { request: RequestDetail }) {
  const { priority } = request;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs sm:p-6">
      <h2 className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Priority signal</h2>
      {priority ? (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-tight text-neutral-900 tabular-nums">{priority.score}</span>
            <span className="text-sm text-neutral-500">/ 100</span>
          </div>
          <div className="mt-2">
            <PriorityBadge priority={priority} showScore={false} />
          </div>
          <ul className="mt-4 flex flex-col gap-1.5 text-sm">
            {priority.components.map((component) => (
              <li key={component.dimension} className="flex justify-between gap-3 text-neutral-600">
                <span>{component.label}</span>
                <span className="font-medium text-neutral-900 tabular-nums">{component.points.toFixed(1)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-neutral-500">
            {bandLabel(priority.band)} is a recommendation for the product team, recalculated as supports change.
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 text-2xl font-semibold text-neutral-400">Unscored</p>
          <p className="mt-2 text-sm text-neutral-600">
            Without triage there are no rubric scores, so no priority is shown. Supports are still counted.
          </p>
        </>
      )}
      <Link href="/how-it-works#priority" className="mt-4 inline-block text-sm font-medium text-indigo-700 hover:underline">
        How priority is calculated
      </Link>
    </section>
  );
}
