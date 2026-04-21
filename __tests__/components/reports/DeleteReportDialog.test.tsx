import type React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";

import { DeleteReportDialog } from "@/components/reports/DeleteReportDialog";

// Minimal locale messages — enough for the dialog.
const messages = {
  reports: {
    delete: {
      trigger: "Delete report",
      title: "Delete this report?",
      body: "Permanent.",
      cancel: "Cancel",
      confirm: "Delete",
      submitting: "Deleting...",
      successTitle: "Report deleted",
      driveFailedBody: "Drive failed.",
      openInDrive: "Open in Drive",
      done: "Done",
      errorGeneric: "Could not delete report. Please try again.",
    },
  },
};

function renderDialog(props: Partial<React.ComponentProps<typeof DeleteReportDialog>> = {}) {
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DeleteReportDialog
        reportId="rep-1"
        reportDate="2026-04-01"
        totalSavings={1234567}
        ownerName={null}
        onClose={onClose}
        onDeleted={onDeleted}
        {...props}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onDeleted };
}

beforeEach(() => {
  // Fresh fetch mock per test
  global.fetch = vi.fn() as unknown as typeof fetch;
});

describe("DeleteReportDialog", () => {
  it("renders the confirm state with title and body", () => {
    renderDialog();
    expect(screen.getByText("Delete this report?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls DELETE /api/reports/[id] and fires onDeleted when drive=deleted", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, drive: "deleted" }),
    });
    const { onDeleted, onClose } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/reports/rep-1", {
        method: "DELETE",
      });
    });
    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("transitions to drive-failed state when drive=failed", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        drive: "failed",
        driveUrl: "https://drive.google.com/file/d/drive-1/view",
      }),
    });
    const { onDeleted } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(screen.getByText("Report deleted")).toBeInTheDocument()
    );
    const link = screen.getByRole("link", { name: "Open in Drive" });
    expect(link).toHaveAttribute(
      "href",
      "https://drive.google.com/file/d/drive-1/view"
    );
    // onDeleted not yet — only fires on Done click
    expect(onDeleted).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it("shows generic error and re-enables Delete on 500", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    });
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(
        screen.getByText("Could not delete report. Please try again.")
      ).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Delete" })).not.toBeDisabled();
  });

  it("falls back to generic error when drive=failed has no driveUrl", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, drive: "failed" }), // no driveUrl
    });
    const { onDeleted, onClose } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(
        screen.getByText("Could not delete report. Please try again.")
      ).toBeInTheDocument()
    );
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).not.toBeDisabled();
  });

  it("treats drive=missing as success (closes + fires onDeleted)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, drive: "missing" }),
    });
    const { onDeleted, onClose } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("treats drive=skipped as success (closes + fires onDeleted)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, drive: "skipped" }),
    });
    const { onDeleted, onClose } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
