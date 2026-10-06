import type { PriorityAssessment, PriorityBand } from "@/domain/priority";
import type { Theme } from "@/domain/themes";

const BAND_STYLES: Record<PriorityBand, { label: string; className: string }> = {
  high: { label: "High", className: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  medium: { label: "Medium", className: "bg-amber-50 text-amber-800 ring-amber-600/20" },
  low: { label: "Low", className: "bg-neutral-100 text-neutral-600 ring-neutral-500/20" },
};

export function bandLabel(band: PriorityBand): string {
  return BAND_STYLES[band].label;
}

export function PriorityBadge({
  priority,
  showScore = true,
}: {
  priority: Pick<PriorityAssessment, "score" | "band"> | null;
  showScore?: boolean;
}) {
  if (!priority) {
    return (
      <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-neutral-500 ring-1 ring-neutral-300 ring-inset [border-style:dashed]">
        Unscored
      </span>
    );
  }

  const style = BAND_STYLES[priority.band];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${style.className}`}
    >
      {showScore && (
        <>
          <span className="tabular-nums">{priority.score}</span>
          <span aria-hidden className="opacity-40">
            ·
          </span>
        </>
      )}
      <span>{style.label} priority</span>
    </span>
  );
}

export function ThemeBadge({ theme }: { theme: Theme | null }) {
  if (!theme) {
    return <span className="text-xs font-medium text-neutral-500">No theme</span>;
  }
  return (
    <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-600/15 ring-inset">
      {theme.label}
    </span>
  );
}

export function NotTriagedBadge() {
  return (
    <span className="inline-flex items-center rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
      Not triaged
    </span>
  );
}
