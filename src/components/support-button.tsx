"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { pluralize } from "@/lib/format";
import { CheckIcon, ChevronUpIcon, SpinnerIcon } from "./icons";

interface SupportButtonProps {
  requestId: string;
  requestTitle: string;
  supportCount: number;
  supported: boolean;
  size?: "compact" | "large";
}

/**
 * Supports a request through the support route handler. The displayed count
 * always comes from the server response; a refresh then re-renders the page so
 * the priority score reflects the new demand.
 */
export function SupportButton({
  requestId,
  requestTitle,
  supportCount,
  supported,
  size = "compact",
}: SupportButtonProps) {
  const router = useRouter();
  const [count, setCount] = useState(supportCount);
  const [isSupported, setIsSupported] = useState(supported);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pending = isSaving || isRefreshing;

  async function handleSupport() {
    if (isSupported || pending) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/requests/${encodeURIComponent(requestId)}/support`, {
        method: "POST",
      });
      if (!response.ok) throw new Error(`Support failed with status ${response.status}`);
      const data: { supportCount: number } = await response.json();
      setCount(data.supportCount);
      setIsSupported(true);
      startRefresh(() => router.refresh());
    } catch {
      setError("Couldn't save your support. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const supporters = pluralize(count, "supporter");
  const label = isSupported
    ? `You support “${requestTitle}”. ${supporters}.`
    : `Support “${requestTitle}”. ${supporters}.`;

  const stateClasses = isSupported
    ? "border-indigo-200 bg-indigo-50 text-indigo-700"
    : "border-neutral-200 bg-white text-neutral-700 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700";

  const Icon = isSaving ? SpinnerIcon : isSupported ? CheckIcon : ChevronUpIcon;
  const iconClasses = `size-4 ${isSaving ? "animate-spin" : ""}`;

  return (
    <div className={size === "large" ? "flex flex-col items-start gap-1.5" : "flex flex-col items-center"}>
      <button
        type="button"
        onClick={handleSupport}
        disabled={pending}
        aria-pressed={isSupported}
        aria-label={label}
        title={isSupported ? "You support this request" : "Support this request"}
        className={`rounded-lg border font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-wait ${stateClasses} ${
          isSupported ? "cursor-default" : ""
        } ${
          size === "large"
            ? "inline-flex items-center gap-2 px-4 py-2 text-sm"
            : "flex w-14 flex-col items-center gap-0.5 py-2 text-sm"
        }`}
      >
        <Icon className={iconClasses} />
        {size === "large" ? (
          <span>
            {isSupported ? "Supported" : "Support"}
            <span className="ml-2 tabular-nums text-neutral-500">{count}</span>
          </span>
        ) : (
          <span className="tabular-nums">{count}</span>
        )}
      </button>
      <span role="status" className={error ? "max-w-48 text-xs text-rose-600" : "sr-only"}>
        {error ?? (isSupported ? `Supported. ${supporters}.` : "")}
      </span>
    </div>
  );
}
