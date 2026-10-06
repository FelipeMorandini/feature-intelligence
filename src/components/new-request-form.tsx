"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AnalyzeResult, DecisionResult } from "@/triage/triage-service";
import { SparkIcon, SpinnerIcon } from "./icons";
import { SupportConfirmation, TriageReview, type PendingAction, type ReviewableResult } from "./triage-review";

interface Limits {
  min: number;
  max: number;
}

interface NewRequestFormProps {
  titleLimits: Limits;
  descriptionLimits: Limits;
}

type FieldErrors = Partial<Record<"title" | "description", string>>;

type Phase =
  | { name: "editing"; error?: ReactNode; fieldErrors?: FieldErrors }
  | { name: "analyzing" }
  | { name: "review"; result: ReviewableResult; pending: PendingAction; error?: ReactNode }
  | { name: "supported"; requestId: string; title: string; supportCount: number; alreadySupported: boolean };

const fieldClasses =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-xs placeholder:text-neutral-400 focus:border-indigo-500 focus:outline-2 focus:outline-indigo-500/20 read-only:bg-neutral-50 read-only:text-neutral-600";

const NETWORK_ERROR = "Couldn't reach the server. Please try again.";
const SERVER_ERROR = "Something went wrong on the server. Nothing was saved.";

type PostResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Posts JSON and tells a network failure apart from a server failure. 4xx
 * responses carry a typed status (e.g. invalid_input, stale_analysis) and are
 * returned as data; 5xx or non-JSON responses are server failures.
 */
async function postJson<T>(url: string, body: unknown): Promise<PostResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
  if (response.status >= 500) return { ok: false, error: SERVER_ERROR };
  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, error: SERVER_ERROR };
  }
}

/**
 * Analyze → Decide. Analyze stores a triage run and returns a recommendation;
 * nothing is created until the person chooses an action. Editing the text
 * discards the analysis, and the server also rejects decisions for text that
 * differs from what was analyzed.
 */
export function NewRequestForm({ titleLimits, descriptionLimits }: NewRequestFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<Phase>({ name: "editing" });
  const reviewRef = useRef<HTMLDivElement>(null);

  // Bring each new analysis into view; it renders below the form.
  const reviewRunId = phase.name === "review" ? phase.result.triageRunId : null;
  useEffect(() => {
    if (!reviewRunId) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reviewRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }, [reviewRunId]);

  const locked = phase.name === "analyzing" || (phase.name === "review" && phase.pending !== null);
  const canAnalyze =
    phase.name === "editing" &&
    title.trim().length >= titleLimits.min &&
    description.trim().length >= descriptionLimits.min;

  function edit(update: () => void) {
    update();
    // Any change makes an existing analysis stale: back to the pre-analysis state.
    if (phase.name !== "editing") setPhase({ name: "editing" });
  }

  async function analyze() {
    if (!canAnalyze) return;
    setPhase({ name: "analyzing" });
    const response = await postJson<AnalyzeResult>("/api/triage", { title, description });
    if (!response.ok) {
      setPhase({ name: "editing", error: response.error });
    } else if (response.data.status === "invalid_input") {
      setPhase({ name: "editing", fieldErrors: response.data.fieldErrors });
    } else {
      setPhase({ name: "review", result: response.data, pending: null });
    }
  }

  async function decide(
    result: ReviewableResult,
    pending: Exclude<PendingAction, null>,
    action: { action: "create"; createAnyway: boolean } | { action: "support_existing"; requestId: string },
  ) {
    setPhase({ name: "review", result, pending });
    const fail = (error: ReactNode) => setPhase({ name: "review", result, pending: null, error });

    const response = await postJson<DecisionResult>(
      `/api/triage/${encodeURIComponent(result.triageRunId)}/decision`,
      { title, description, ...action },
    );
    if (!response.ok) return fail(response.error);
    const decision = response.data;

    switch (decision.status) {
      case "created":
        router.push(`/requests/${decision.requestId}?created=${decision.triaged ? "triaged" : "untriaged"}`);
        return;
      case "supported": {
        const target =
          result.status === "analyzed" && result.probableDuplicate?.requestId === decision.requestId
            ? result.probableDuplicate.title
            : "the existing request";
        setPhase({
          name: "supported",
          requestId: decision.requestId,
          title: target,
          supportCount: decision.supportCount,
          alreadySupported: decision.alreadySupported,
        });
        return;
      }
      case "stale_analysis":
        setPhase({ name: "editing", error: "Your text changed after it was analyzed. Please analyze it again." });
        return;
      case "already_decided":
        return fail(
          <>
            This analysis was already used.{" "}
            <Link href={`/requests/${decision.requestId}`} className="font-medium underline">
              View the result
            </Link>
          </>,
        );
      case "decision_required":
        return fail("A probable duplicate needs your decision first.");
      default:
        return fail("Something went wrong. Please analyze your request again.");
    }
  }

  function reset() {
    setTitle("");
    setDescription("");
    setPhase({ name: "editing" });
  }

  if (phase.name === "supported") {
    return <SupportConfirmation {...phase} onReset={reset} />;
  }

  const fieldErrors = phase.name === "editing" ? phase.fieldErrors : undefined;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs sm:p-6">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Submit a feature request</h1>
        <p className="mt-1 mb-6 text-sm text-neutral-600">
          Tell us what you need. Before anything is saved, triage checks whether someone has already asked for it.
        </p>

        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void analyze();
          }}
        >
          <Field
            id="title"
            label="Title"
            hint="A short summary of what you would like."
            count={`${title.length}/${titleLimits.max}`}
            error={fieldErrors?.title}
          >
            <input
              id="title"
              name="title"
              value={title}
              onChange={(event) => edit(() => setTitle(event.target.value))}
              readOnly={locked}
              minLength={titleLimits.min}
              maxLength={titleLimits.max}
              required
              placeholder="e.g. Notify me in Slack when a task is assigned to me"
              aria-describedby="title-hint"
              aria-invalid={Boolean(fieldErrors?.title)}
              className={fieldClasses}
            />
          </Field>

          <Field
            id="description"
            label="Description"
            hint="Describe the problem, not just the solution — it helps triage find requests with the same underlying need."
            count={`${description.length}/${descriptionLimits.max}`}
            error={fieldErrors?.description}
          >
            <textarea
              id="description"
              name="description"
              value={description}
              onChange={(event) => edit(() => setDescription(event.target.value))}
              readOnly={locked}
              minLength={descriptionLimits.min}
              maxLength={descriptionLimits.max}
              required
              rows={6}
              placeholder="What are you trying to do, what gets in the way today, and how do you work around it?"
              aria-describedby="description-hint"
              aria-invalid={Boolean(fieldErrors?.description)}
              className={`${fieldClasses} resize-y`}
            />
          </Field>

          {phase.name === "editing" && phase.error && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {phase.error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-neutral-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-neutral-500" aria-live="polite">
              {phase.name === "analyzing"
                ? "Analyzing your request against the backlog. AI triage can take a few seconds."
                : phase.name === "review"
                  ? "Editing the text will discard this analysis."
                  : "Nothing is saved when you analyze."}
            </p>
            {phase.name !== "review" && (
              <button
                type="submit"
                disabled={!canAnalyze}
                aria-busy={phase.name === "analyzing"}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {phase.name === "analyzing" ? (
                  <SpinnerIcon className="size-4 animate-spin" />
                ) : (
                  <SparkIcon className="size-4" />
                )}
                {phase.name === "analyzing" ? "Analyzing…" : "Analyze"}
              </button>
            )}
          </div>
        </form>
      </section>

      {phase.name === "review" && (
        <div ref={reviewRef} className="scroll-mt-6">
          <TriageReview
            result={phase.result}
            pending={phase.pending}
            error={phase.error}
            onCreate={({ createAnyway }) =>
              decide(phase.result, createAnyway ? "create_anyway" : "create", { action: "create", createAnyway })
            }
            onSupport={(requestId) => decide(phase.result, "support", { action: "support_existing", requestId })}
          />
        </div>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  count,
  error,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  count: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium text-neutral-900">
          {label}
        </label>
        <span className="text-xs text-neutral-500 tabular-nums" aria-hidden>
          {count}
        </span>
      </div>
      {children}
      {error ? (
        <p id={`${id}-hint`} className="text-xs text-rose-700">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-xs text-neutral-500">
          {hint}
        </p>
      )}
    </div>
  );
}
