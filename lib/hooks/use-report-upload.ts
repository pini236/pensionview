"use client";

// =============================================================================
// PensionView — useReportUpload
//
// Shared upload hook for /admin/backfill and the inline reports-page modal.
// Handles bounded-concurrent POSTs to /api/pipeline/backfill so multi-file
// uploads don't run sequentially (N×T) but also don't slam the server.
//
// Concurrency cap is 3: the pipeline does heavy server work (decrypt, OCR,
// LLM extraction) and we'd rather queue than overwhelm it.
// =============================================================================

import { useCallback, useRef, useState } from "react";

const MAX_PARALLEL = 3;

export type UploadStatus = "pending" | "processing" | "done" | "error";

export interface UploadResult {
  fileName: string;
  status: UploadStatus;
  message?: string;
  reportId?: string;
}

export interface UploadInput {
  files: File[];
  profileId: string;
  reportDate?: string;
}

export interface UseReportUploadResult {
  upload: (input: UploadInput) => Promise<UploadResult[]>;
  isUploading: boolean;
  results: UploadResult[];
  reset: () => void;
}

interface UseReportUploadOptions {
  /** Called whenever any file's status changes — same shape as `results`. */
  onProgress?: (results: UploadResult[]) => void;
  /** Called once after all files have settled. */
  onComplete?: (results: UploadResult[]) => void;
  /** Localised "processing started" success blurb attached to done rows. */
  successMessage?: string;
  /** Localised fallback when the server returns an error without a message. */
  fallbackErrorMessage?: string;
}

export function useReportUpload(
  options: UseReportUploadOptions = {},
): UseReportUploadResult {
  const { onProgress, onComplete, successMessage, fallbackErrorMessage } = options;

  const [results, setResults] = useState<UploadResult[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Mirror state in a ref so the worker loop never reads a stale snapshot
  // (state setters are async and we update many times per upload batch).
  const resultsRef = useRef<UploadResult[]>([]);

  const publish = useCallback(() => {
    const snapshot = resultsRef.current.slice();
    setResults(snapshot);
    onProgress?.(snapshot);
  }, [onProgress]);

  const reset = useCallback(() => {
    resultsRef.current = [];
    setResults([]);
  }, []);

  const upload = useCallback(
    async (input: UploadInput): Promise<UploadResult[]> => {
      const { files, profileId, reportDate } = input;
      if (!profileId || files.length === 0) {
        return [];
      }

      setIsUploading(true);
      resultsRef.current = files.map((f) => ({
        fileName: f.name,
        status: "pending" as UploadStatus,
      }));
      publish();

      // Bounded concurrency: spawn N workers each pulling the next index from
      // a shared cursor. Results array is pre-sized so writes stay ordered.
      let cursor = 0;
      const total = files.length;

      async function worker() {
        while (true) {
          const i = cursor++;
          if (i >= total) return;

          resultsRef.current[i] = {
            ...resultsRef.current[i]!,
            status: "processing",
          };
          publish();

          try {
            const formData = new FormData();
            formData.append("file", files[i]!);
            formData.append("profileId", profileId);
            if (reportDate) formData.append("reportDate", reportDate);

            const response = await fetch("/api/pipeline/backfill", {
              method: "POST",
              body: formData,
            });

            if (response.ok) {
              const data = (await response
                .json()
                .catch(() => ({}))) as { reportId?: string };
              resultsRef.current[i] = {
                ...resultsRef.current[i]!,
                status: "done",
                message: successMessage,
                reportId: data.reportId,
              };
            } else {
              const data = (await response.json().catch(() => ({}))) as {
                error?: string;
              };
              resultsRef.current[i] = {
                ...resultsRef.current[i]!,
                status: "error",
                message: data.error ?? fallbackErrorMessage,
              };
            }
          } catch (err) {
            resultsRef.current[i] = {
              ...resultsRef.current[i]!,
              status: "error",
              message: err instanceof Error ? err.message : String(err),
            };
          }

          publish();
        }
      }

      const workerCount = Math.min(MAX_PARALLEL, total);
      await Promise.all(
        Array.from({ length: workerCount }, () => worker()),
      );

      const final = resultsRef.current.slice();
      setIsUploading(false);
      onComplete?.(final);
      return final;
    },
    [publish, onComplete, successMessage, fallbackErrorMessage],
  );

  return { upload, isUploading, results, reset };
}
