"use client";

import { useState } from "react";

interface UploadResult {
  fileName: string;
  status: "pending" | "processing" | "done" | "error";
  message?: string;
}

export default function BackfillPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [profileId, setProfileId] = useState("");
  const [results, setResults] = useState<UploadResult[]>([]);
  const [processing, setProcessing] = useState(false);

  async function handleUpload() {
    if (!profileId || files.length === 0) return;
    setProcessing(true);
    const newResults: UploadResult[] = files.map((f) => ({
      fileName: f.name,
      status: "pending",
    }));
    setResults(newResults);

    for (let i = 0; i < files.length; i++) {
      newResults[i].status = "processing";
      setResults([...newResults]);

      try {
        const formData = new FormData();
        formData.append("file", files[i]);
        formData.append("profileId", profileId);

        const response = await fetch("/api/pipeline/backfill", {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          newResults[i].status = "done";
          newResults[i].message = "Processing started";
        } else {
          const data = await response.json();
          newResults[i].status = "error";
          newResults[i].message = data.error;
        }
      } catch (error) {
        newResults[i].status = "error";
        newResults[i].message = String(error);
      }

      setResults([...newResults]);
    }

    setProcessing(false);
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-8 text-2xl font-bold text-text-primary">Backfill Reports</h1>

      <div className="space-y-6">
        <div>
          <label className="mb-2 block text-sm text-text-muted">Profile ID</label>
          <input
            type="text"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            className="w-full rounded-lg bg-surface px-4 py-2 text-text-primary outline-none focus:ring-2 focus:ring-cta"
            placeholder="UUID of the profile"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-text-muted">PDF Reports (decrypted)</label>
          <input
            type="file"
            multiple
            accept=".pdf"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
            className="w-full text-text-muted"
          />
        </div>

        <button
          onClick={handleUpload}
          disabled={processing || !profileId || files.length === 0}
          className="rounded-lg bg-cta px-6 py-2 font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {processing ? "Processing..." : `Upload ${files.length} file(s)`}
        </button>

        {results.length > 0 && (
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg bg-surface p-3">
                <span className={`h-2 w-2 rounded-full ${
                  r.status === "done" ? "bg-gain" :
                  r.status === "error" ? "bg-loss" :
                  r.status === "processing" ? "animate-pulse bg-cta" :
                  "bg-text-muted"
                }`} />
                <span className="text-sm text-text-primary">{r.fileName}</span>
                {r.message && (
                  <span className="text-xs text-text-muted">{r.message}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
