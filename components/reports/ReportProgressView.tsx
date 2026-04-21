"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Circle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DeleteReportDialog } from "@/components/reports/DeleteReportDialog";
import { MemberAvatar } from "@/components/members/MemberAvatar";
import type { Member } from "@/lib/types";

const POLL_INTERVAL_MS = 3000;

// ---------------------------------------------------------------------------
// Phase model
// ---------------------------------------------------------------------------

type PhaseId = "decrypt" | "upload_drive" | "extract" | "validate" | "insight" | "finalize";
type PhaseStatus = "pending" | "active" | "done" | "failed";

interface Phase {
  id: PhaseId;
  labelKey: string;
  status: PhaseStatus;
}

// Canonical order of backend step names used to derive phase positions.
// Mirrors lib/workflow/pipeline.ts — `download` is omitted (backfill skips it,
// Gmail does it invisibly). Drive upload now runs after validate so its
// filename can use the report_date extracted from the PDF.
type BackendStep =
  | "decrypt"
  | "extract_page"
  | "validate"
  | "resolve_drive_folder"
  | "upload_drive"
  | "generate_insight"
  | "complete";

const STEP_TO_PHASE_INDEX: Record<BackendStep, number> = {
  decrypt: 0,
  extract_page: 1,
  validate: 2,
  resolve_drive_folder: 3,
  upload_drive: 3,
  generate_insight: 4,
  complete: 5,
};

const PHASE_DEFS: { id: PhaseId; labelKey: string }[] = [
  { id: "decrypt", labelKey: "phases.decrypt" },
  { id: "extract", labelKey: "phases.extract" },
  { id: "validate", labelKey: "phases.validate" },
  { id: "upload_drive", labelKey: "phases.upload_drive" },
  { id: "insight", labelKey: "phases.insight" },
  { id: "finalize", labelKey: "phases.finalize" },
];

function derivePhases(
  status: string,
  currentStep: string | null
): Phase[] {
  const activeIndex =
    currentStep && currentStep in STEP_TO_PHASE_INDEX
      ? STEP_TO_PHASE_INDEX[currentStep as BackendStep]
      : -1;

  return PHASE_DEFS.map((def, i) => {
    let phaseStatus: PhaseStatus;

    if (status === "done") {
      phaseStatus = "done";
    } else if (status === "failed") {
      if (i < activeIndex) {
        phaseStatus = "done";
      } else if (i === activeIndex) {
        phaseStatus = "failed";
      } else {
        phaseStatus = "pending";
      }
    } else {
      // processing
      if (activeIndex === -1) {
        phaseStatus = i === 0 ? "active" : "pending";
      } else if (i < activeIndex) {
        phaseStatus = "done";
      } else if (i === activeIndex) {
        phaseStatus = "active";
      } else {
        phaseStatus = "pending";
      }
    }

    return { ...def, status: phaseStatus };
  });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReportProgressViewProps {
  reportId: string;
  reportDate: string | null;
  ownerMember?: Member | null;
  initialStatus: string;
  initialStep: string | null;
  initialDetail: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportProgressView({
  reportId,
  reportDate,
  ownerMember,
  initialStatus,
  initialStep,
  initialDetail,
}: ReportProgressViewProps) {
  const t = useTranslations("reports.processing");
  const router = useRouter();
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";

  const [status, setStatus] = useState(initialStatus);
  const [currentStep, setCurrentStep] = useState<string | null>(initialStep);
  const [currentDetail, setCurrentDetail] = useState<Record<string, unknown> | null>(initialDetail);
  // Track date in local state so the header reflects it the moment the
  // pipeline writes it (extract step on cover page, validate as backstop)
  // — without waiting for a router.refresh + full server re-render.
  const [liveReportDate, setLiveReportDate] = useState<string | null>(reportDate);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const stateRef = useRef({ status, currentStep, currentDetail, liveReportDate });
  useEffect(() => {
    stateRef.current = { status, currentStep, currentDetail, liveReportDate };
  }, [status, currentStep, currentDetail, liveReportDate]);

  useEffect(() => {
    if (status !== "processing") return;

    let cancelled = false;

    async function pollOnce() {
      try {
        const res = await fetch(`/api/reports/${reportId}`, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as {
          status: string;
          current_step: string | null;
          current_step_detail: Record<string, unknown> | null;
          report_date: string | null;
        };
        if (cancelled) return;

        const prev = stateRef.current;
        if (
          body.status !== prev.status ||
          body.current_step !== prev.currentStep ||
          JSON.stringify(body.current_step_detail) !== JSON.stringify(prev.currentDetail)
        ) {
          setStatus(body.status);
          setCurrentStep(body.current_step);
          setCurrentDetail(body.current_step_detail);
        }
        if (body.report_date !== prev.liveReportDate) {
          setLiveReportDate(body.report_date);
        }

        if (body.status === "done") {
          router.refresh();
        }
      } catch {
        // Transient network errors — let the next tick try again.
      }
    }

    const interval = setInterval(pollOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [reportId, router, status]);

  async function handleRetry() {
    setIsRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/retry`, { method: "POST" });
      if (!res.ok) {
        setIsRetrying(false);
        setRetryError(t("failed_default"));
        return;
      }
      retryTimeoutRef.current = setTimeout(() => {
        retryTimeoutRef.current = null;
        setStatus("processing");
        setIsRetrying(false);
      }, 1000);
    } catch {
      setIsRetrying(false);
      setRetryError(t("failed_default"));
    }
  }

  const phases = derivePhases(status, currentStep);
  const isFailed = status === "failed";

  const failureReason = (() => {
    const detail = currentDetail ?? {};
    if (typeof detail.failure_reason === "string" && detail.failure_reason) {
      return detail.failure_reason;
    }
    return null;
  })();

  const extractDetail = (() => {
    if (currentStep !== "extract_page") return null;
    const detail = currentDetail ?? {};
    const page = typeof detail.page === "number" ? detail.page : null;
    const total = typeof detail.total_pages === "number" ? detail.total_pages : null;
    return page !== null && total !== null ? { page, total } : null;
  })();

  const dateLabel = liveReportDate
    ? new Date(liveReportDate).toLocaleDateString(fullLocale, {
        month: "long",
        year: "numeric",
      })
    : t("date_pending");

  return (
    <div className="space-y-4">
      {ownerMember && (
        <div className="flex items-center gap-2">
          <MemberAvatar member={ownerMember} size="sm" />
          <span className="text-sm font-medium text-text-primary">{ownerMember.name}</span>
        </div>
      )}

      <div className="rounded-xl bg-surface p-6">
        <p className="text-sm text-text-muted">{dateLabel}</p>
        <p className="mt-1 text-xl font-medium text-text-primary">
          {isFailed ? t("failed_title") : isRetrying ? t("retrying") : t("view_title")}
        </p>
        {!isFailed && !isRetrying && (
          <p className="mt-0.5 text-sm text-text-muted">{t("view_subtitle")}</p>
        )}
      </div>

      <div className="rounded-xl bg-surface p-6">
        <ol className="space-y-4" aria-label="Processing phases">
          {phases.map((phase) => (
            <PhaseRow
              key={phase.id}
              phase={phase}
              extractDetail={phase.id === "extract" && phase.status === "active" ? extractDetail : null}
              currentStepIsNull={currentStep === null && status === "processing"}
              t={t}
            />
          ))}
        </ol>

        {isFailed && failureReason && (
          <p className="mt-4 rounded-lg bg-background px-4 py-3 text-sm text-loss">
            {failureReason}
          </p>
        )}

        {retryError && (
          <p className="mt-3 text-sm text-loss" role="alert">{retryError}</p>
        )}

        {isFailed && (
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRetry}
              disabled={isRetrying}
            >
              <RefreshCw size={13} className={isRetrying ? "animate-spin" : ""} />
              <span className="ms-1.5">{t("retry")}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteOpen(true)}
            >
              {t("delete_action")}
            </Button>
          </div>
        )}
      </div>

      {deleteOpen && (
        <DeleteReportDialog
          reportId={reportId}
          reportDate={liveReportDate}
          totalSavings={0}
          ownerName={ownerMember?.name ?? null}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => router.push(`/${locale}/reports`)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase row sub-component
// ---------------------------------------------------------------------------

interface PhaseRowProps {
  phase: Phase;
  extractDetail: { page: number; total: number } | null;
  currentStepIsNull: boolean;
  t: ReturnType<typeof useTranslations<"reports.processing">>;
}

function PhaseRow({ phase, extractDetail, currentStepIsNull, t }: PhaseRowProps) {
  const isActive = phase.status === "active";
  const isDone = phase.status === "done";
  const isFailed = phase.status === "failed";
  const isPending = phase.status === "pending";

  const label = (() => {
    if (phase.id === "extract" && isActive) {
      if (extractDetail) {
        return t("phases.extract_active", {
          page: extractDetail.page,
          total: extractDetail.total,
        });
      }
      return t("phases.extract");
    }
    // When no step has been recorded yet, show "Starting..." on the first phase
    if (isActive && currentStepIsNull) {
      return t("starting");
    }
    return t(phase.labelKey as Parameters<typeof t>[0]);
  })();

  return (
    <li className="flex items-center gap-3">
      <PhaseIcon status={phase.status} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={`${phase.id}-${phase.status}-${label}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={[
            "text-sm",
            isDone ? "text-text-muted" : "",
            isActive ? "font-medium text-text-primary" : "",
            isFailed ? "font-medium text-loss" : "",
            isPending ? "text-text-muted/60" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </li>
  );
}

function PhaseIcon({ status }: { status: PhaseStatus }) {
  if (status === "done") {
    return (
      <motion.span
        key="done"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
        className="flex-shrink-0 text-gain"
      >
        <CheckCircle size={18} />
      </motion.span>
    );
  }
  if (status === "active") {
    return <Loader2 size={18} className="flex-shrink-0 animate-spin text-cta" />;
  }
  if (status === "failed") {
    return <XCircle size={18} className="flex-shrink-0 text-loss" />;
  }
  return <Circle size={18} className="flex-shrink-0 text-text-muted/40" />;
}
