"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  fetchAppUpdateStatus,
  subscribeAppUpdateStatus,
  type AppUpdateStatus,
} from "@/lib/app-update";
import { normalizeVersionTag } from "@/lib/version";

interface VersionBadgeProps {
  /** Render the compact variant for the collapsed sidebar (currently hidden). */
  collapsed?: boolean;
}

export function VersionBadge({ collapsed = false }: VersionBadgeProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AppUpdateStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const unsubscribe = subscribeAppUpdateStatus((signal) => {
      if (!active) return;
      if (signal.status) setStatus(signal.status);
      setError(signal.error);
    });

    void fetchAppUpdateStatus(controller.signal).catch((cause) => {
      if (!active || controller.signal.aborted) return;
      setError(
        cause instanceof Error ? cause.message : "Unable to check for updates",
      );
    });

    return () => {
      active = false;
      controller.abort();
      unsubscribe();
    };
  }, []);

  // Keep the collapsed sidebar entirely free of version chrome.
  if (collapsed) return null;

  const tag =
    normalizeVersionTag(status?.current_version) ??
    normalizeVersionTag(process.env.NEXT_PUBLIC_APP_VERSION || "");
  const displayTag = tag ?? "—";
  const state = error
    ? { dot: "bg-red-500", label: t("Status check failed") }
    : status?.update_available
      ? { dot: "bg-amber-500", label: t("Update available") }
      : status?.release
        ? { dot: "bg-emerald-500", label: t("Up to date") }
        : status && !status.check_enabled
          ? {
              dot: "bg-[var(--muted-foreground)]/35",
              label: t("Version checks are disabled."),
            }
          : {
              dot: "bg-[var(--muted-foreground)]/35",
              label: status ? t("Not checked yet") : t("Checking..."),
            };

  return (
    <span
      title={displayTag}
      className="flex min-w-0 flex-1 items-center rounded-lg px-3 py-1.5 text-[11px] font-mono tabular-nums tracking-tight text-[var(--muted-foreground)]/55"
    >
      <span className="truncate leading-none">{displayTag}</span>
    </span>
  );
}
