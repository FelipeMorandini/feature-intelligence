import { DEMAND_SATURATION_SUPPORTS, MAX_MODEL_SCORE, type PriorityAssessment } from "@/domain/priority";
import { PRODUCT_STRATEGY } from "@/domain/product-strategy";
import { pluralize } from "@/lib/format";
import type { RequestEnrichment } from "@/triage/contract";

interface PriorityBreakdownProps {
  priority: PriorityAssessment;
  rubric: RequestEnrichment["rubric"];
}

const formatPoints = (points: number) => points.toFixed(1);

/**
 * Shows every input to the priority score: what the model scored and why,
 * what was observed, each weight, and the points each dimension contributes.
 */
export function PriorityBreakdown({ priority, rubric }: PriorityBreakdownProps) {
  const goals = PRODUCT_STRATEGY.goals.filter((goal) =>
    (rubric.strategicAlignment.goalIds as readonly string[]).includes(goal.id),
  );

  const rationale: Record<string, string> = {
    severity: rubric.severity.rationale,
    strategicAlignment: rubric.strategicAlignment.rationale,
    workaroundGap: rubric.workaroundGap.rationale,
  };

  return (
    <div>
      <ul className="divide-y divide-neutral-100">
        {priority.components.map((component) => {
          const isModel = component.source === "model";
          return (
            <li key={component.dimension} className="py-4 first:pt-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="flex items-baseline gap-2">
                  <h4 className="text-sm font-semibold text-neutral-900">{component.label}</h4>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                      isModel ? "bg-violet-50 text-violet-700" : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {isModel ? "AI-scored" : "Computed"}
                  </span>
                </div>
                <div className="text-sm text-neutral-600 tabular-nums">
                  {isModel ? (
                    <span className="font-medium text-neutral-900">
                      {component.input}/{MAX_MODEL_SCORE}
                    </span>
                  ) : (
                    <span className="font-medium text-neutral-900">{pluralize(component.input, "support")}</span>
                  )}
                  <span className="mx-1.5 text-neutral-300">·</span>
                  {Math.round(component.weight * 100)}% weight
                  <span className="mx-1.5 text-neutral-300">·</span>
                  <span className="font-medium text-neutral-900">{formatPoints(component.points)} pts</span>
                </div>
              </div>

              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100"
                role="img"
                aria-label={`${Math.round(component.normalized * 100)}% of the maximum for ${component.label}`}
              >
                <div
                  className={`h-full rounded-full ${isModel ? "bg-violet-500" : "bg-emerald-500"}`}
                  style={{ width: `${component.normalized * 100}%` }}
                />
              </div>

              <p className="mt-2 text-sm text-neutral-600">
                {isModel
                  ? rationale[component.dimension]
                  : `Calculated by the application from the current support count. Demand reaches its full weight at ${DEMAND_SATURATION_SUPPORTS} supports.`}
              </p>

              {component.dimension === "strategicAlignment" && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {goals.length > 0 ? (
                    goals.map((goal) => (
                      <span
                        key={goal.id}
                        className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs text-neutral-700"
                        title={goal.id}
                      >
                        {goal.title}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-neutral-500">Not linked to any strategy goal.</span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
        Score = sum of weighted contributions, rounded ({priority.score}/100). Computed by application code; the model
        never sets the score or band.
      </p>
    </div>
  );
}
