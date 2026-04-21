"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { DeleteReportDialog } from "./DeleteReportDialog";

interface ReportRowActionsProps {
  reportId: string;
  reportDate: string | null;
  totalSavings: number;
  ownerName?: string | null;
}

export function ReportRowActions({
  reportId,
  reportDate,
  totalSavings,
  ownerName,
}: ReportRowActionsProps) {
  const t = useTranslations("reports.delete");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={t("trigger")}
        className="me-2 flex h-9 w-9 items-center justify-center rounded-full text-text-muted opacity-100 transition-all hover:bg-surface-hover hover:text-text-primary hover:opacity-100 sm:opacity-50 sm:hover:opacity-100 sm:group-hover:opacity-100 cursor-pointer"
      >
        <Trash2 size={16} />
      </button>
      {open && (
        <DeleteReportDialog
          reportId={reportId}
          reportDate={reportDate}
          totalSavings={totalSavings}
          ownerName={ownerName}
          onClose={() => setOpen(false)}
          onDeleted={() => router.refresh()}
        />
      )}
    </>
  );
}
