import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createQueueEntries } from "@/lib/pipeline/queue";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const profileId = formData.get("profileId") as string;

    if (!file || !profileId) {
      return NextResponse.json({ error: "Missing file or profileId" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Reject uploads targeted at archived profiles. The backfill picker is
    // already filtered to non-deleted members on the page, so this is a
    // server-side safety net for stale form posts.
    // TODO: when supporting multiple households, also assert the profile
    // belongs to the operator's household.
    const { data: profileCheck } = await admin.from("profiles")
      .select("id, deleted_at")
      .eq("id", profileId)
      .maybeSingle();

    if (!profileCheck) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    if (profileCheck.deleted_at) {
      return NextResponse.json(
        { error: "Profile is archived; restore before uploading reports" },
        { status: 410 }
      );
    }

    // Extract date from filename (e.g., "דוח תקופתי 02-2026.pdf" → 2026-02-28)
    const dateMatch = file.name.match(/(\d{2})-(\d{4})/);
    let reportDate: string;
    if (dateMatch) {
      const month = dateMatch[1];
      const year = dateMatch[2];
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      reportDate = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
    } else {
      reportDate = new Date().toISOString().slice(0, 10);
    }

    // Check for existing report
    const { data: existing } = await admin.from("reports")
      .select("id")
      .eq("profile_id", profileId)
      .eq("report_date", reportDate)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "Report already exists for this date" }, { status: 409 });
    }

    // Store as both raw and decrypted (uploaded files are pre-decrypted by user)
    const buffer = Buffer.from(await file.arrayBuffer());
    const decryptedPath = `reports/${profileId}/${reportDate}/decrypted.pdf`;
    await admin.storage.from("reports").upload(decryptedPath, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

    // Create report record (skip raw_pdf_url since this is a manual upload)
    const { data: report } = await admin.from("reports").insert({
      profile_id: profileId,
      report_date: reportDate,
      status: "processing",
      decrypted_pdf_url: decryptedPath,
    }).select("id").single();

    if (!report) throw new Error("Failed to create report");

    // Create queue entries (backfill: skip download step)
    await createQueueEntries(report.id, 10, true);

    // Trigger the first step (decrypt — which for backfill just propagates the file)
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    fetch(`${APP_URL}/api/pipeline/decrypt?reportId=${report.id}&pageCount=10`, {
      method: "POST",
    }).catch(() => {});

    return NextResponse.json({ ok: true, reportId: report.id, reportDate });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
