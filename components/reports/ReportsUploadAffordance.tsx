"use client";

// =============================================================================
// PensionView — ReportsUploadAffordance
//
// Client island that owns the upload modal lifecycle for the reports page:
//   - Renders the header "Upload report" button
//   - Mounts page-wide dragenter/dragover/drop listeners + overlay
//   - Lazily fetches /api/members so the picker has data
//   - Exposes an `openUploadModal` callback via context so other parts of the
//     reports page (e.g. NoReportsState) can trigger the same modal
//
// We attach drag listeners to `document` rather than a wrapper div so the
// overlay covers the entire viewport regardless of where the user drags onto.
// dragenter fires multiple times as the cursor crosses child nodes — we use
// a depth counter so dragleave only hides the overlay when truly leaving.
// =============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import { Upload, UploadCloud } from "lucide-react";
import { ReportUploadModal } from "./ReportUploadModal";
import { NoReportsState } from "@/components/empty-states/NoReportsState";

interface Profile {
  id: string;
  name: string | null;
  email?: string;
}

interface UploadModalCtx {
  open: (files?: File[]) => void;
}

const UploadModalContext = createContext<UploadModalCtx | null>(null);

/** Trigger the shared upload modal from any descendant of the provider. */
export function useReportUploadModal(): UploadModalCtx {
  const ctx = useContext(UploadModalContext);
  if (!ctx) {
    throw new Error(
      "useReportUploadModal must be used inside ReportsUploadProvider",
    );
  }
  return ctx;
}

interface ReportsUploadProviderProps {
  children: ReactNode;
}

export function ReportsUploadProvider({ children }: ReportsUploadProviderProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragOverlayVisible, setIsDragOverlayVisible] = useState(false);

  // dragenter fires per child node — count depth so dragleave doesn't flicker.
  const dragDepth = useRef(0);

  // Fetch members once on mount; cheap and the modal needs them ready.
  useEffect(() => {
    let cancelled = false;
    async function loadProfiles() {
      try {
        const res = await fetch("/api/members", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { members?: Profile[] };
        if (!cancelled) setProfiles(json.members ?? []);
      } catch {
        if (!cancelled) setProfiles([]);
      }
    }
    loadProfiles();
    return () => {
      cancelled = true;
    };
  }, []);

  const open = useCallback((files?: File[]) => {
    setPendingFiles(files && files.length > 0 ? files : []);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setPendingFiles([]);
  }, []);

  // Global drag/drop listeners — only react to drags carrying files.
  useEffect(() => {
    function hasFiles(e: DragEvent): boolean {
      return Array.from(e.dataTransfer?.types ?? []).includes("Files");
    }

    function onDragEnter(e: DragEvent) {
      if (!hasFiles(e)) return;
      dragDepth.current += 1;
      setIsDragOverlayVisible(true);
    }

    function onDragOver(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault(); // required to allow drop
    }

    function onDragLeave(e: DragEvent) {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) {
        setIsDragOverlayVisible(false);
      }
    }

    function onDrop(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setIsDragOverlayVisible(false);
      const dropped = Array.from(e.dataTransfer?.files ?? []).filter(
        (f) =>
          f.type === "application/pdf" ||
          f.name.toLowerCase().endsWith(".pdf"),
      );
      if (dropped.length > 0) {
        open(dropped);
      }
    }

    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, [open]);

  return (
    <UploadModalContext.Provider value={{ open }}>
      {children}

      <AnimatePresence>
        {isDragOverlayVisible && (
          <motion.div
            key="drag-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-cta bg-surface/90 p-10 text-center">
              <UploadCloud size={48} className="text-cta" />
              <p className="text-base font-medium text-text-primary">
                <UploadOverlayLabel />
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isOpen && (
        <ReportUploadModal
          profiles={profiles}
          initialFiles={pendingFiles}
          onClose={close}
        />
      )}
    </UploadModalContext.Provider>
  );
}

/** Header trigger button — opens the modal from inside the provider. */
export function ReportUploadButton() {
  const t = useTranslations("reports.upload");
  const { open } = useReportUploadModal();
  return (
    <button
      type="button"
      onClick={() => open()}
      className="inline-flex items-center gap-2 rounded-lg bg-cta px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 cursor-pointer"
    >
      <Upload size={16} />
      {t("button")}
    </button>
  );
}

/**
 * Wraps `NoReportsState` so the empty-state CTA opens the shared modal.
 * Used on the reports page; the dashboard's empty state continues to link
 * to /admin/backfill (no provider mounted there).
 */
export function ReportUploadEmptyState() {
  const { open } = useReportUploadModal();
  return <NoReportsState onUploadClick={() => open()} />;
}

function UploadOverlayLabel() {
  const t = useTranslations("reports.upload");
  return <>{t("dropzone_drag_active")}</>;
}
