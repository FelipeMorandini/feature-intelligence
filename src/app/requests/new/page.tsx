import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { NewRequestForm } from "@/components/new-request-form";
import { DESCRIPTION_LIMITS, TITLE_LIMITS } from "@/triage/input";

export const metadata: Metadata = { title: "Submit a request" };

const STEPS = [
  "AI extracts the underlying problem and suggests a theme.",
  "It checks existing requests for the same need and explains any probable match.",
  "You decide: support the existing request, or create yours anyway.",
];

export default function NewRequestPage() {
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
      >
        <ArrowLeftIcon className="size-4" />
        Back to backlog
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs sm:p-6 lg:col-span-2">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Submit a feature request</h1>
          <p className="mt-1 mb-6 text-sm text-neutral-600">
            Tell us what you need. Before anything is saved, triage checks whether someone has already asked for it.
          </p>
          <NewRequestForm titleLimits={TITLE_LIMITS} descriptionLimits={DESCRIPTION_LIMITS} />
        </section>

        <aside className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs sm:p-6">
          <h2 className="text-sm font-semibold text-neutral-900">What happens when you analyze</h2>
          <ol className="mt-3 flex flex-col gap-3">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm text-neutral-600">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-neutral-500">
            Nothing is merged automatically.{" "}
            <Link href="/how-it-works" className="font-medium text-indigo-700 hover:underline">
              How triage works
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
