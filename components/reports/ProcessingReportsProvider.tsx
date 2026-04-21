"use client";

// =============================================================================
// PensionView — ProcessingReportsProvider
//
// Single polling context for all in-flight reports on the reports list page.
// Instead of each ReportProcessingRow running its own setInterval, this
// provider polls /api/reports/processing once every 3s and distributes the
// per-report state via the useProcessingReport(id) hook.
//
// When any report transitions to "done", we call router.refresh() once so the
// parent server component re-fetches and replaces the processing row with the
// completed report row.
// =============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { ProcessingReportStatus } from "@/app/api/reports/processing/route";

const POLL_INTERVAL_MS = 3000;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type PollMap = Map<string, ProcessingReportStatus>;

interface ProcessingReportsCtx {
  getReport: (id: string) => ProcessingReportStatus | undefined;
  /**
   * Live snapshot of every in-flight report the polling endpoint currently
   * returns — including reports that didn't exist when the page was
   * server-rendered (e.g. uploaded from another tab or right before the user
   * navigated here from /admin/backfill). Always returns a fresh array so
   * React iterates correctly when the underlying map changes.
   */
  allReports: ProcessingReportStatus[];
}

const ProcessingReportsContext = createContext<ProcessingReportsCtx | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ProcessingReportsProviderProps {
  /** Server-rendered initial data — seeds the map before the first poll tick. */
  initialReports: ProcessingReportStatus[];
  children: React.ReactNode;
}

export function ProcessingReportsProvider({
  initialReports,
  children,
}: ProcessingReportsProviderProps) {
  const router = useRouter();

  // Initialise from server-rendered props so the first render is instant.
  const [pollMap, setPollMap] = useState<PollMap>(() => {
    const m = new Map<string, ProcessingReportStatus>();
    for (const r of initialReports) {
      m.set(r.id, r);
    }
    return m;
  });

  // Keep a ref of the current map so the interval callback never captures a
  // stale closure.
  const pollMapRef = useRef(pollMap);
  useEffect(() => {
    pollMapRef.current = pollMap;
  }, [pollMap]);

  // Track IDs that have already triggered a router.refresh() so we only call
  // it once per transition, not on every tick after the transition.
  const refreshedRef = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;

    async function pollOnce() {
      try {
        const res = await fetch("/api/reports/processing", { cache: "no-store" });
        if (!res.ok || cancelled) return;

        const body = (await res.json()) as { reports: ProcessingReportStatus[] };
        if (cancelled) return;

        const incoming = new Map<string, ProcessingReportStatus>();
        for (const r of body.reports) {
          incoming.set(r.id, r);
        }

        // Detect transitions to "done" for IDs that were previously in-flight.
        // A report is "done" when it no longer appears in the response (the
        // endpoint only returns processing/failed rows), OR if the row itself
        // carries status="done" (shouldn't happen given the WHERE clause, but
        // handle defensively).
        const prev = pollMapRef.current;
        let needsRefresh = false;

        for (const [id, prevRow] of prev.entries()) {
          if (prevRow.status === "processing" || prevRow.status === "failed") {
            const next = incoming.get(id);
            // Gone from the response → transitioned to done (or deleted).
            if (!next && !refreshedRef.current.has(id)) {
              refreshedRef.current.add(id);
              needsRefresh = true;
            }
            // Explicitly done (defensive).
            if (next?.status === "done" && !refreshedRef.current.has(id)) {
              refreshedRef.current.add(id);
              needsRefresh = true;
            }
          }
        }

        if (!cancelled) {
          setPollMap(incoming);
          if (needsRefresh) {
            router.refresh();
          }
        }
      } catch {
        // Transient network errors — swallow and retry next tick.
      }
    }

    const interval = setInterval(pollOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [router]);

  const getReport = useCallback(
    (id: string) => pollMap.get(id),
    [pollMap],
  );

  // Stable-per-pollMap array so consumers can iterate without triggering
  // pointless re-renders. Sorted by id for a deterministic order; the parent
  // page re-sorts visually as needed.
  const allReports = useMemo(
    () => Array.from(pollMap.values()).sort((a, b) => a.id.localeCompare(b.id)),
    [pollMap],
  );

  return (
    <ProcessingReportsContext.Provider value={{ getReport, allReports }}>
      {children}
    </ProcessingReportsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProcessingReport(
  reportId: string,
): ProcessingReportStatus | undefined {
  const ctx = useContext(ProcessingReportsContext);
  if (!ctx) {
    throw new Error("useProcessingReport must be used inside ProcessingReportsProvider");
  }
  return ctx.getReport(reportId);
}

/**
 * Live list of every in-flight report from the polling endpoint. Use this
 * instead of a server-rendered iteration when the UI must show reports that
 * appeared after the page loaded (multi-file upload → /reports flow).
 */
export function useProcessingReportsList(): ProcessingReportStatus[] {
  const ctx = useContext(ProcessingReportsContext);
  if (!ctx) {
    throw new Error("useProcessingReportsList must be used inside ProcessingReportsProvider");
  }
  return ctx.allReports;
}
