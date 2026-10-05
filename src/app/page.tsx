import { PRIORITY_RUBRIC } from "@/domain/priority";
import { PRODUCT_STRATEGY } from "@/domain/product-strategy";
import { THEMES } from "@/domain/themes";

// Foundation-stage placeholder. The backlog UI replaces this page next.
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16">
      <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">Foundation build</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Feature Intelligence</h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-400">
        AI-assisted triage for {PRODUCT_STRATEGY.productName} feature requests. The backlog and
        submission flow are not built yet.
      </p>

      <section className="mt-10 grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold">Strategy goals</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-neutral-600 dark:text-neutral-400">
            {PRODUCT_STRATEGY.goals.map((goal) => (
              <li key={goal.id}>{goal.title}</li>
            ))}
          </ol>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Priority rubric</h2>
          <ul className="mt-2 space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
            {Object.entries(PRIORITY_RUBRIC).map(([key, dimension]) => (
              <li key={key}>
                {dimension.label} · {Math.round(dimension.weight * 100)}% ·{" "}
                {dimension.source === "model" ? "AI-scored" : "computed"}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Themes</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {THEMES.map((theme) => (
            <li
              key={theme.id}
              className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400"
            >
              {theme.label}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
