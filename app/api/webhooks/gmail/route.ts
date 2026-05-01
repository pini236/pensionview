import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { processGmailNotification } from "@/lib/gmail";
import { createAdminClient } from "@/lib/supabase/admin";
import { startReportPipeline } from "@/lib/workflow/start";
import { logEvent } from "@/lib/observability";
import { clearGoogleTokens, isInvalidGrantError } from "@/lib/google-auth";

// ---------------------------------------------------------------------------
// Pub/Sub OIDC verification
//
// Pub/Sub push subscriptions sign every request with a Google-issued OIDC
// JWT in the Authorization: Bearer header. Without verifying it the endpoint
// would happily accept any caller posting a forged base64 envelope.
// ---------------------------------------------------------------------------

const PUBSUB_AUDIENCE =
  process.env.NEXT_PUBLIC_APP_URL || "https://pensionview.vercel.app";
const oauthClient = new OAuth2Client();

async function verifyPubsubAuth(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.substring(7);
  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken: token,
      audience: PUBSUB_AUDIENCE,
    });
    const payload = ticket.getPayload();
    return (
      payload?.email_verified === true &&
      payload?.iss === "https://accounts.google.com"
    );
  } catch (err) {
    console.error("Pub/Sub OIDC verification failed:", err);
    return false;
  }
}

export async function POST(request: NextRequest) {
  const authed = await verifyPubsubAuth(request.headers.get("authorization"));
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let emailAddress: string | undefined;
  try {
    const body = await request.json();
    const data = JSON.parse(
      Buffer.from(body.message.data, "base64").toString()
    );
    emailAddress = data.emailAddress;
    const { historyId } = data;

    const reports = await processGmailNotification(historyId, emailAddress!);
    const admin = createAdminClient();

    for (const { profileId, downloadUrl, reportDate } of reports) {
      // Idempotent insert: ignoreDuplicates returns no row if a report for
      // (profile_id, report_date) already exists, so we naturally skip
      // duplicates without a separate read-then-write race window.
      const { data: report, error } = await admin
        .from("reports")
        .upsert(
          {
            profile_id: profileId,
            report_date: reportDate,
            status: "processing",
            raw_pdf_url: downloadUrl,
          },
          { onConflict: "profile_id,report_date", ignoreDuplicates: true }
        )
        .select("id")
        .maybeSingle();

      if (error) {
        // Surface DB errors so Pub/Sub retries instead of silently dropping.
        throw error;
      }
      if (!report) continue; // duplicate — already inserted on a prior delivery

      try {
        await startReportPipeline({ reportId: report.id, isBackfill: false });
      } catch (startError) {
        logEvent("pipeline.start_failed", {
          feature: "pipeline",
          reportId: report.id,
          error: startError,
        });
        await admin
          .from("reports")
          .update({ status: "failed" })
          .eq("id", report.id);
      }
    }

    return NextResponse.json({ ok: true, processed: reports.length });
  } catch (error) {
    // A revoked refresh token is user-fixable, not retryable. Clear the
    // dead tokens so the UI flips to "reconnect Gmail", then ack the
    // delivery — otherwise Pub/Sub retries indefinitely and floods logs
    // until the message's 7-day retention expires.
    if (isInvalidGrantError(error)) {
      if (emailAddress) {
        const admin = createAdminClient();
        const { data: profile } = await admin
          .from("profiles")
          .select("id")
          .eq("email", emailAddress)
          .maybeSingle();
        if (profile?.id) await clearGoogleTokens(admin, profile.id);
      }
      logEvent("gmail.token_revoked", { feature: "gmail", emailAddress });
      return NextResponse.json({ ok: true, disconnected: true });
    }

    // Returning 500 lets Pub/Sub apply its retry policy. Previously this
    // returned { ok: true } which silently dropped failed deliveries.
    console.error("Gmail webhook error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
