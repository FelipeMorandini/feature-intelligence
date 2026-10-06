"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { pluralize } from "@/lib/format";
import type { AnalyzeResult, TriageMatchView, TriageUnavailableReason } from "@/triage/triage-service";
import { PriorityBadge, ThemeBadge } from "./badges";
import { CheckIcon, SparkIcon, SpinnerIcon } from "./icons";
import { PriorityBreakdown } from "./priority-breakdown";

export type ReviewableResult = Extract<AnalyzeResult, { status: "analyzed" | "unavailable" }>;
export type PendingAction = "create" | "create_anyway" | "support" | null;

interface TriageReviewProps {
  result: ReviewableResult;
  pending: PendingAction;
  error: ReactNode;
  onCreate: (options: { createAnyway: boolean }) => void;
  onSupport: (requestId: string) => void;
}

const UNAVAILABLE_COPY: Record<TriageUnavailableReason, string> = {
  not_configured: "AI triage is not configured on this server.",
  timeout: "The AI provider took too long to respond.",
  provider_error: "The AI provider could not complete the analysis.",
  invalid_output: "The AI response failed validation twice, so it was discarded rather than trusted.",
};

const CONFIDENCE_LABEL = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" } as const;

/** The human review step: shows the format-checked recommendation and offers the decisions. */
export function TriageReview({ result, pending, error, onCreate, onSupport }: TriageReviewProps) {
  if (result.status === "unavailable") {
    return (
      <section aria-labelledby="triage-unavailable" className="rounded-xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
        <h2 id="triage-unavailable" className="text-base font-semibold text-amber-950">
          AI triage is unavailable
        </h2>
        <p className="mt-1 text-sm text-amber-900">{UNAVAILABLE_COPY[result.reason]}</p>
        <p className="mt-3 text-sm text-amber-900">
          You can still submit your request. It will be saved exactly as written, marked as not triaged, with no problem
          statement, theme or priority invented in its place.
        </p>
        <ErrorMessage error={error} />
        <div className="mt-5 flex justify-end">
          <ActionButton primary pending={pending === "create"} disabled={pending !== null} onClick={() => onCreate({ createAnyway: false })}>
            Submit without triage
          </ActionButton>
        </div>
      </section>
    );
  }

  const { analysis, probableDuplicate, otherMatches } = result;

  return (
    <div className="flex flex-col gap-6">
      {probableDuplicate && (
        <DuplicateDecision match={probableDuplicate} pending={pending} error={error} onCreate={onCreate} onSupport={onSupport} />
      )}

      <section aria-labelledby="analysis-heading" className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">AI triage of your request</p>
            <h2 id="analysis-heading" className="text-base font-semibold text-neutral-900">
              Recommendation
            </h2>
          </div>
          <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 ring-1 ring-violet-600/20 ring-inset">
            <SparkIcon className="size-3.5" />
            AI-generated · format checked
          </span>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          The app checked the response structure and request references. The recommendation itself is AI judgment.
        </p>

        <dl className="mt-5 flex flex-col gap-5">
          <div>
            <dt className="text-xs font-semibold tracking-wide text-indigo-600 uppercase">Underlying problem</dt>
            <dd className="mt-1 text-sm text-neutral-900">{analysis.problemStatement}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-indigo-600 uppercase">Theme</dt>
            <dd className="mt-1.5 flex flex-col items-start gap-1.5 text-sm text-neutral-600">
              <ThemeBadge theme={analysis.theme} />
              <span>{analysis.themeRationale}</span>
            </dd>
          </div>
          <div>
            <dt className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold tracking-wide text-indigo-600 uppercase">Priority recommendation</span>
              <PriorityBadge priority={analysis.priority} />
            </dt>
            <dd className="mt-3">
              <PriorityBreakdown priority={analysis.priority} rubric={analysis.rubric} />
              <p className="mt-2 text-xs text-neutral-500">
                You count as the first supporter of a new request, so observed demand starts at one support and grows as
                others support it.
              </p>
            </dd>
          </div>
        </dl>

        {!probableDuplicate && (
          <div className="mt-6 flex flex-col gap-3 border-t border-neutral-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-neutral-600">No existing request appears to cover the same need.</p>
            <ActionButton primary pending={pending === "create"} disabled={pending !== null} onClick={() => onCreate({ createAnyway: false })}>
              Create request
            </ActionButton>
          </div>
        )}
        {!probableDuplicate && <ErrorMessage error={error} />}
      </section>

      {otherMatches.length > 0 && <OtherMatches matches={otherMatches} />}
    </div>
  );
}

function DuplicateDecision({
  match,
  pending,
  error,
  onCreate,
  onSupport,
}: {
  match: TriageMatchView;
  pending: PendingAction;
  error: ReactNode;
  onCreate: TriageReviewProps["onCreate"];
  onSupport: TriageReviewProps["onSupport"];
}) {
  return (
    <section
      aria-labelledby="duplicate-heading"
      className="rounded-xl border-2 border-indigo-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <p className="text-xs font-semibold tracking-wide text-indigo-600 uppercase">Probable duplicate · your decision</p>
      <h2 id="duplicate-heading" className="mt-1 text-lg font-semibold text-neutral-900">
        This looks like an existing request
      </h2>
      <p className="mt-1 text-sm text-neutral-600">
        Nothing has been created or merged. Review the match and choose what happens next.
      </p>

      <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <Link
            href={`/requests/${match.requestId}`}
            target="_blank"
            className="font-semibold text-neutral-900 hover:text-indigo-700 hover:underline"
          >
            {match.title}
            <span className="sr-only"> (opens in a new tab)</span>
          </Link>
          <span className="w-fit shrink-0 rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white">
            {CONFIDENCE_LABEL[match.confidence]} duplicate
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-neutral-500">
          <ThemeBadge theme={match.theme} />
          <span>{pluralize(match.supportCount, "supporter")}</span>
          {match.priority && <PriorityBadge priority={match.priority} />}
        </div>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-neutral-900">Shared underlying need</dt>
            <dd className="mt-1 text-neutral-600">{match.sharedNeed}</dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-900">What differs</dt>
            <dd className="mt-1 text-neutral-600">{match.differences}</dd>
          </div>
        </dl>
      </div>

      {match.supportedByViewer && (
        <p className="mt-3 text-sm text-neutral-600">
          You already support this request. Supporting again won&apos;t add a second vote, but your wording will be kept with
          it.
        </p>
      )}

      <ErrorMessage error={error} />

      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <ActionButton
          pending={pending === "create_anyway"}
          disabled={pending !== null}
          onClick={() => onCreate({ createAnyway: true })}
        >
          Create as new anyway
        </ActionButton>
        <ActionButton primary pending={pending === "support"} disabled={pending !== null} onClick={() => onSupport(match.requestId)}>
          Support existing request
        </ActionButton>
      </div>
      <p className="mt-3 text-xs text-neutral-500 sm:text-right">
        Recommended: supporting adds your vote to the existing request and keeps your wording with it.
      </p>
    </section>
  );
}

function OtherMatches({ matches }: { matches: TriageMatchView[] }) {
  const label = (match: TriageMatchView) =>
    match.relationship === "related"
      ? "Related"
      : match.confidence === "low"
        ? "Possible duplicate · low confidence"
        : `Also similar · ${CONFIDENCE_LABEL[match.confidence].toLowerCase()}`;

  return (
    <section aria-labelledby="other-matches" className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs sm:p-6">
      <h2 id="other-matches" className="text-base font-semibold text-neutral-900">
        Related requests
      </h2>
      <p className="mt-1 text-sm text-neutral-600">For context only — these do not block creating your request.</p>
      <ul className="mt-4 flex flex-col divide-y divide-neutral-100">
        {matches.map((match) => (
          <li key={match.requestId} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <Link
                href={`/requests/${match.requestId}`}
                target="_blank"
                className="text-sm font-medium text-neutral-900 hover:text-indigo-700 hover:underline"
              >
                {match.title}
                <span className="sr-only"> (opens in a new tab)</span>
              </Link>
              <span className="shrink-0 text-xs font-medium text-neutral-500">{label(match)}</span>
            </div>
            <p className="mt-1 text-sm text-neutral-600">{match.differences}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActionButton({
  children,
  primary = false,
  pending,
  disabled,
  onClick,
}: {
  children: ReactNode;
  primary?: boolean;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={pending}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
        primary
          ? "bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:outline-indigo-600"
          : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 focus-visible:outline-neutral-500"
      }`}
    >
      {pending && <SpinnerIcon className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

function ErrorMessage({ error }: { error: ReactNode }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {error}
    </p>
  );
}

export function SupportConfirmation({
  requestId,
  title,
  supportCount,
  alreadySupported,
  onReset,
}: {
  requestId: string;
  title: string;
  supportCount: number;
  alreadySupported: boolean;
  onReset: () => void;
}) {
  return (
    <section role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
          <CheckIcon className="size-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-emerald-950">
            {alreadySupported ? "You already support this request" : "Your support was added"}
          </h2>
          <p className="mt-1 text-sm text-emerald-900">
            “{title}” now has {pluralize(supportCount, "supporter")}. Your original wording was kept with it so the
            product team can see how you described the need. No new request was created.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/requests/${requestId}`}
              className="rounded-lg bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
            >
              View request
            </Link>
            <button
              type="button"
              onClick={onReset}
              className="rounded-lg border border-emerald-300 bg-white px-3.5 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              Submit another request
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
