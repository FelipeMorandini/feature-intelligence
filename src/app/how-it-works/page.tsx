import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  DEMAND_SATURATION_SUPPORTS,
  normalizeObservedDemand,
  PRIORITY_BANDS,
  PRIORITY_RUBRIC,
} from "@/domain/priority";
import { PRODUCT_STRATEGY } from "@/domain/product-strategy";
import { THEMES } from "@/domain/themes";

export const metadata: Metadata = { title: "How it works" };

const DEMAND_EXAMPLES = [0, 1, 3, 7, 12, DEMAND_SATURATION_SUPPORTS, 50];

const RESPONSIBILITIES = [
  {
    who: "AI model",
    does: [
      "Extracts the underlying customer problem",
      "Classifies the request into one theme",
      "Flags probable duplicates and explains the shared need and differences",
      "Scores severity, strategic alignment and workaround gap from 1 to 5, with a rationale for each",
    ],
  },
  {
    who: "Application code",
    does: [
      "Validates every model response against a strict schema before using it",
      "Rejects references to requests the model was never shown",
      "Computes observed demand from real supports",
      "Calculates the final score and band, and stores the result",
    ],
  },
  {
    who: "People",
    does: [
      "Support the requests that matter to them",
      "Decide whether a probable duplicate is really the same request",
      "Make the actual product and roadmap decisions",
    ],
  },
];

export default function HowItWorksPage() {
  const demandWeight = PRIORITY_RUBRIC.observedDemand.weight * 100;

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">How it works</h1>
        <p className="mt-2 text-neutral-600">
          Feature Intelligence uses AI in a deliberately bounded way. The model interprets requests and makes
          recommendations; application code validates, scores and stores the results; people make every
          consequential decision. Nothing here is a black box: the taxonomy, goals and formula below are the exact
          values the application uses.
        </p>
      </header>

      <Section title="Who decides what">
        <div className="grid gap-4 sm:grid-cols-3">
          {RESPONSIBILITIES.map((group) => (
            <div key={group.who} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
              <h3 className="text-sm font-semibold text-neutral-900">{group.who}</h3>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-sm text-neutral-600">
                {group.does.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Duplicates are never merged automatically">
        <p>
          When a new request looks like an existing one, you will see the proposed match, how confident the triage is,
          and why it thinks the two describe the same need. You then choose: support the existing request (your wording
          is kept with it), or create your request anyway. The AI suggests; it does not consolidate.
        </p>
      </Section>

      <Section title="Themes" description="A fixed taxonomy keeps grouping stable. The model must choose one of these.">
        <dl className="grid gap-3 sm:grid-cols-2">
          {THEMES.map((theme) => (
            <div key={theme.id} className="rounded-lg border border-neutral-200 bg-white p-3">
              <dt className="text-sm font-medium text-neutral-900">{theme.label}</dt>
              <dd className="mt-0.5 text-sm text-neutral-600">{theme.description}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        title="Product strategy"
        description={`Strategic alignment is judged against these explicit goals for ${PRODUCT_STRATEGY.productName} — the same text the model receives.`}
      >
        <ol className="flex flex-col gap-3">
          {PRODUCT_STRATEGY.goals.map((goal, index) => (
            <li key={goal.id} className="flex gap-3 rounded-lg border border-neutral-200 bg-white p-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-neutral-900">{goal.title}</p>
                <p className="mt-0.5 text-sm text-neutral-600">{goal.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="priority"
        title="Priority rubric"
        description="Three dimensions are scored by the model; one is measured. Application code combines them."
      >
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Dimension</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Weight</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Source</th>
                <th scope="col" className="px-4 py-2.5 font-medium">What it measures</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {Object.entries(PRIORITY_RUBRIC).map(([key, dimension]) => (
                <tr key={key} className="align-top">
                  <th scope="row" className="px-4 py-3 font-medium text-neutral-900">{dimension.label}</th>
                  <td className="px-4 py-3 text-neutral-900 tabular-nums">{Math.round(dimension.weight * 100)}%</td>
                  <td className="px-4 py-3 whitespace-nowrap text-neutral-600">
                    {dimension.source === "model" ? "AI-scored (1–5)" : "Computed"}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {dimension.question}
                    <span className="mt-1 block text-xs text-neutral-500">
                      {dimension.anchors.low}; {dimension.anchors.high}.
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Each AI score is mapped onto 0–1 (1 → 0, 5 → 1), multiplied by its weight, and the four contributions are
          added up to give a score out of 100. The bands are{" "}
          {PRIORITY_BANDS.map((band, index) => (
            <span key={band.band}>
              <strong className="font-medium text-neutral-900">{band.label}</strong>
              {band.minScore > 0 ? ` (${band.minScore}+)` : ` (below ${PRIORITY_BANDS[index - 1].minScore})`}
              {index < PRIORITY_BANDS.length - 2 ? ", " : index === PRIORITY_BANDS.length - 2 ? " and " : "."}
            </span>
          ))}
        </p>
      </Section>

      <Section title="Observed demand" description="Measured from supports, never estimated by the model.">
        <p>
          The person who submits a request counts as its first supporter. Every support counts, but each additional
          one counts a little less, and demand reaches its full{" "}
          {demandWeight}% weight at {DEMAND_SATURATION_SUPPORTS} supports. That way early signal matters, and a pile-on
          cannot drown out the other dimensions. Formally: min(1, log₂(1 + supports) / log₂(
          {1 + DEMAND_SATURATION_SUPPORTS})).
        </p>
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Supports</th>
                {DEMAND_EXAMPLES.map((supports) => (
                  <th key={supports} scope="col" className="px-3 py-2.5 font-medium tabular-nums">
                    {supports}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="px-4 py-3 font-medium text-neutral-900">Points</th>
                {DEMAND_EXAMPLES.map((supports) => (
                  <td key={supports} className="px-3 py-3 text-neutral-700 tabular-nums">
                    {(normalizeObservedDemand(supports) * demandWeight).toFixed(1)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Popularity and strategic value are separate signals">
        <p>
          A request can be very popular and still score modestly if it is low-severity, easy to work around or
          unrelated to the strategy — and a niche request that blocks core work can rank highly with few supports.
          Keeping the signals separate, and showing each one, lets the product team see <em>why</em> something ranks
          where it does instead of trusting a single opaque number.
        </p>
      </Section>

      <Section title="A signal, not a decision">
        <p>
          The priority score is a recommendation to inform the product team. It does not schedule work, close
          requests or change the roadmap. Model scores can be wrong, which is why every score is shown alongside its
          rationale.
        </p>
        <p>
          <Link href="/" className="font-medium text-indigo-700 hover:underline">
            Browse the backlog
          </Link>{" "}
          to see these signals on real requests.
        </p>
      </Section>
    </div>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-3 text-sm leading-relaxed text-neutral-700">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-neutral-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}
