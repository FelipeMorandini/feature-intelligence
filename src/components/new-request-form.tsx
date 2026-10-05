"use client";

import { useState } from "react";
import { SparkIcon } from "./icons";

interface Limits {
  min: number;
  max: number;
}

interface NewRequestFormProps {
  titleLimits: Limits;
  descriptionLimits: Limits;
}

const fieldClasses =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-xs placeholder:text-neutral-400 focus:border-indigo-500 focus:outline-2 focus:outline-indigo-500/20";

/**
 * Form shell for the Analyze → Decide workflow. Analysis is not connected
 * yet, so the button is disabled and nothing is submitted or faked.
 */
export function NewRequestForm({ titleLimits, descriptionLimits }: NewRequestFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  return (
    <form className="flex flex-col gap-5" onSubmit={(event) => event.preventDefault()}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="title" className="text-sm font-medium text-neutral-900">
            Title
          </label>
          <span className="text-xs text-neutral-500 tabular-nums" aria-hidden>
            {title.length}/{titleLimits.max}
          </span>
        </div>
        <input
          id="title"
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          minLength={titleLimits.min}
          maxLength={titleLimits.max}
          required
          placeholder="e.g. Notify me in Slack when a task is assigned to me"
          aria-describedby="title-hint"
          className={fieldClasses}
        />
        <p id="title-hint" className="text-xs text-neutral-500">
          A short summary of what you would like.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="description" className="text-sm font-medium text-neutral-900">
            Description
          </label>
          <span className="text-xs text-neutral-500 tabular-nums" aria-hidden>
            {description.length}/{descriptionLimits.max}
          </span>
        </div>
        <textarea
          id="description"
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          minLength={descriptionLimits.min}
          maxLength={descriptionLimits.max}
          required
          rows={7}
          placeholder="What are you trying to do, what gets in the way today, and how do you work around it?"
          aria-describedby="description-hint"
          className={`${fieldClasses} resize-y`}
        />
        <p id="description-hint" className="text-xs text-neutral-500">
          Describe the problem, not just the solution — it helps triage find requests with the same underlying need.
        </p>
      </div>

      <div
        role="note"
        className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
      >
        <p className="font-medium">Development state</p>
        <p className="mt-0.5">
          AI triage integration is the next implementation step. Analyze is disabled, so nothing is submitted or
          analysed yet.
        </p>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-neutral-100 pt-5">
        <button
          type="submit"
          disabled
          aria-describedby="analyze-hint"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          <SparkIcon className="size-4" />
          Analyze
        </button>
      </div>
      <p id="analyze-hint" className="sr-only">
        Analyze is not available yet.
      </p>
    </form>
  );
}
