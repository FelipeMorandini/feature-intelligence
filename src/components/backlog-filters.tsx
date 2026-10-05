"use client";

import Form from "next/form";
import Link from "next/link";
import type { ChangeEvent } from "react";
import { SearchIcon } from "./icons";

interface BacklogFiltersProps {
  q: string;
  theme: string | undefined;
  sort: string;
  themes: ReadonlyArray<{ id: string; label: string }>;
  isFiltered: boolean;
}

const SORT_OPTIONS = [
  { value: "priority", label: "Priority" },
  { value: "supported", label: "Most supported" },
  { value: "newest", label: "Newest" },
];

const controlClasses =
  "h-10 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 shadow-xs focus:border-indigo-500 focus:outline-2 focus:outline-indigo-500/20";

/**
 * A GET form (next/form navigates client-side): filters live in the URL, so
 * every view is inspectable and shareable, and it still works without JavaScript. Selects apply
 * immediately; search applies on Enter or the Search button.
 */
export function BacklogFilters({ q, theme, sort, themes, isFiltered }: BacklogFiltersProps) {
  const submitOnChange = (event: ChangeEvent<HTMLSelectElement>) => event.currentTarget.form?.requestSubmit();

  return (
    <Form
      action="/"
      role="search"
      aria-label="Filter feature requests"
      className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-xs sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <label htmlFor="q" className="sr-only">
          Search requests
        </label>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search titles and descriptions…"
            className={`${controlClasses} w-full pl-9`}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor="theme" className="text-xs font-medium text-neutral-600">
            Theme
          </label>
          <select id="theme" name="theme" defaultValue={theme ?? ""} onChange={submitOnChange} className={controlClasses}>
            <option value="">All themes</option>
            {themes.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="sort" className="text-xs font-medium text-neutral-600">
            Sort by
          </label>
          <select id="sort" name="sort" defaultValue={sort} onChange={submitOnChange} className={controlClasses}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="h-10 rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
        >
          Search
        </button>
        {isFiltered && (
          <Link href="/" className="h-10 content-center px-2 text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Clear
          </Link>
        )}
      </div>
    </Form>
  );
}
