"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  UploadCloud,
  Loader2,
  CheckCircle,
  XCircle,
  Circle,
  User,
  Calendar,
} from "lucide-react";

type UploadStatus = "pending" | "processing" | "done" | "error";

interface UploadResult {
  fileName: string;
  status: UploadStatus;
  message?: string;
}

// Shape returned by /api/members (Member type from lib/types). We only need
// the fields the picker renders.
interface Profile {
  id: string;
  name: string | null;
  email?: string;
}

export default function BackfillPage() {
  const locale = useLocale();
  const router = useRouter();
  const isHe = locale === "he";

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profileId, setProfileId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [reportDate, setReportDate] = useState<string>("");
  const [results, setResults] = useState<UploadResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Use /api/members instead of a direct Supabase query so the household
    // filter (and any future RLS) is enforced server-side. The page used to
    // pull every row from `profiles`, which leaks across households once
    // multi-tenant lands.
    const loadProfiles = async () => {
      try {
        const res = await fetch("/api/members", { credentials: "include" });
        if (!res.ok) {
          setProfiles([]);
          return;
        }
        const json = (await res.json()) as { members?: Profile[] };
        setProfiles(json.members ?? []);
      } catch {
        setProfiles([]);
      } finally {
        setProfilesLoading(false);
      }
    };
    loadProfiles();
  }, []);

  function addFiles(newFiles: File[]) {
    const pdfs = newFiles.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size));
      const filtered = pdfs.filter((f) => !existing.has(f.name + f.size));
      return [...prev, ...filtered];
    });
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    addFiles(selected);
    // reset so picking the same file twice still triggers change
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files || []);
    addFiles(dropped);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function openPicker() {
    fileInputRef.current?.click();
  }

  async function handleUpload() {
    if (!profileId || files.length === 0) return;
    setProcessing(true);

    const newResults: UploadResult[] = files.map((f) => ({
      fileName: f.name,
      status: "pending",
    }));
    setResults(newResults);

    const succeededReportIds: string[] = [];

    for (let i = 0; i < files.length; i++) {
      newResults[i].status = "processing";
      setResults([...newResults]);

      try {
        const formData = new FormData();
        formData.append("file", files[i]);
        formData.append("profileId", profileId);
        // Only send the date if the user explicitly entered one. Otherwise
        // let the server fall back to filename parsing.
        if (reportDate) formData.append("reportDate", reportDate);

        const response = await fetch("/api/pipeline/backfill", {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          const data = (await response.json().catch(() => ({}))) as {
            ok?: boolean;
            reportId?: string;
          };
          newResults[i].status = "done";
          newResults[i].message = isHe ? "העיבוד החל" : "Processing started";
          if (data.reportId) {
            succeededReportIds.push(data.reportId);
          }
        } else {
          const data = await response.json().catch(() => ({}));
          newResults[i].status = "error";
          newResults[i].message = data.error || (isHe ? "שגיאה לא ידועה" : "Unknown error");
        }
      } catch (error) {
        newResults[i].status = "error";
        newResults[i].message = String(error);
      }

      setResults([...newResults]);
    }

    setProcessing(false);

    // Give the user a brief moment to see the "Processing started" confirmation
    // before navigating away. Single success → detail page; multiple → list.
    if (succeededReportIds.length === 1) {
      setTimeout(() => {
        router.push(`/${locale}/reports/${succeededReportIds[0]}`);
      }, 500);
    } else if (succeededReportIds.length > 1) {
      setTimeout(() => {
        router.push(`/${locale}/reports`);
      }, 500);
    }
  }

  const dropzoneClasses = [
    "relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer",
    isDragging
      ? "border-cta bg-cta/10"
      : "border-surface-hover hover:border-cta hover:bg-surface/50",
  ].join(" ");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-text-primary">
          {isHe ? "טעינת דוחות" : "Backfill reports"}
        </h1>
        <p className="text-sm text-text-muted">
          {isHe
            ? "העלה דוחות PDF שאינם מוצפנים כדי למלא את ההיסטוריה והמגמות שלך."
            : "Upload unencrypted PDF reports to populate your history and trends."}
        </p>
      </header>

      <section className="space-y-3 rounded-xl bg-surface p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <User size={18} className="text-text-muted" />
          {isHe ? "בחר פרופיל" : "Choose profile"}
        </div>

        {profilesLoading ? (
          <p className="text-sm text-text-muted">{isHe ? "טוען פרופילים..." : "Loading profiles..."}</p>
        ) : profiles.length === 0 ? (
          <p className="text-sm text-text-muted">{isHe ? "לא נמצאו פרופילים" : "No profiles found"}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {profiles.map((p) => {
              const selected = p.id === profileId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProfileId(p.id)}
                  className={[
                    "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-start transition-colors cursor-pointer",
                    selected
                      ? "border-cta bg-cta/10"
                      : "border-surface-hover bg-background hover:border-cta/50",
                  ].join(" ")}
                >
                  <span className="text-sm font-medium text-text-primary">
                    {p.name || (isHe ? "ללא שם" : "Unnamed")}
                  </span>
                  {p.email && (
                    <span className="text-xs text-text-muted">{p.email}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl bg-surface p-6">
        <label
          htmlFor="report-date"
          className="flex items-center gap-2 text-sm font-medium text-text-primary"
        >
          <Calendar size={18} className="text-text-muted" />
          {isHe ? "תאריך הדוח (אופציונלי)" : "Report date (optional)"}
        </label>
        <input
          id="report-date"
          type="date"
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
          className="w-full rounded-lg border border-surface-hover bg-background p-2 text-sm text-text-primary"
        />
        <p className="text-xs text-text-muted">
          {isHe
            ? "השאר ריק כדי לזהות אוטומטית מהשם של הקובץ (MM-YYYY). השתמש בשדה זה כשהשם אינו ברור (למשל העלאת דוח מרץ באפריל)."
            : "Leave blank to auto-detect from the filename (MM-YYYY). Set this when the filename is ambiguous (e.g. uploading a March report on April 1)."}
        </p>
      </section>

      <section className="space-y-4 rounded-xl bg-surface p-6">
        <div
          role="button"
          tabIndex={0}
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openPicker();
            }
          }}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragEnter={onDragOver}
          onDragLeave={onDragLeave}
          className={dropzoneClasses}
          aria-label={isHe ? "אזור העלאת קבצים" : "File upload area"}
        >
          <UploadCloud size={48} className="text-text-muted" />
          <p className="mt-3 text-base font-medium text-text-primary">
            {isHe ? "גרור קבצי PDF לכאן" : "Drop PDF files here"}
          </p>
          <p className="mt-1 text-sm text-cta">
            {isHe ? "או לחץ לבחירה" : "or click to browse"}
          </p>
          {files.length > 0 && (
            <p className="mt-3 text-sm text-text-primary">
              {isHe ? `נבחרו ${files.length} קבצים` : `${files.length} files selected`}
            </p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,application/pdf"
            onChange={onFileInputChange}
            className="hidden"
          />
        </div>

        <p className="text-xs text-text-muted">
          {isHe
            ? "הקבצים חייבים להיות PDF ללא הצפנה (עד 25MB)"
            : "Files must be unencrypted PDFs (up to 25MB)"}
        </p>

        <button
          type="button"
          onClick={handleUpload}
          disabled={processing || !profileId || files.length === 0}
          className="w-full cursor-pointer rounded-lg bg-cta px-6 py-3 font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {processing
            ? isHe
              ? "מעבד..."
              : "Processing..."
            : isHe
              ? `העלה ${files.length} דוחות`
              : `Upload ${files.length} reports`}
        </button>
      </section>

      {results.length > 0 && (
        <section className="space-y-2 rounded-xl bg-surface p-6">
          <h2 className="mb-2 text-sm font-medium text-text-primary">
            {isHe ? "התקדמות" : "Progress"}
          </h2>
          <AnimatePresence initial={false}>
            {results.map((r, i) => (
              <motion.div
                key={`${r.fileName}-${i}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                className="flex items-center gap-3 rounded-lg bg-background p-3"
              >
                <StatusIcon status={r.status} />
                <span className="flex-1 truncate text-sm text-text-primary">
                  {r.fileName}
                </span>
                {r.message && (
                  <span
                    className={[
                      "text-xs",
                      r.status === "error" ? "text-loss" : "text-text-muted",
                    ].join(" ")}
                  >
                    {r.message}
                  </span>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </section>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: UploadStatus }) {
  if (status === "processing") {
    return <Loader2 size={18} className="animate-spin text-cta" />;
  }
  if (status === "done") {
    return <CheckCircle size={18} className="text-gain" />;
  }
  if (status === "error") {
    return <XCircle size={18} className="text-loss" />;
  }
  return <Circle size={18} className="text-text-muted" />;
}
