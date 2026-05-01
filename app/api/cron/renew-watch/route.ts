import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setupGmailWatch } from "@/lib/gmail";
import { assertVercelCron } from "@/lib/auth-internal";
import { clearGoogleTokens, isInvalidGrantError } from "@/lib/google-auth";

export async function GET(request: NextRequest) {
  const unauth = assertVercelCron(request);
  if (unauth) return unauth;

  try {
    const admin = createAdminClient();
    const { data: profiles } = await admin.from("profiles")
      .select("id")
      .not("google_access_token", "is", null);

    if (profiles) {
      for (const profile of profiles) {
        try {
          await setupGmailWatch(profile.id);
        } catch (err) {
          // A revoked token can't be renewed — clear it so Settings
          // surfaces the reconnect CTA instead of falsely showing
          // "connected" while the daily renewal silently fails.
          if (isInvalidGrantError(err)) {
            await clearGoogleTokens(admin, profile.id);
          }
          console.error("setupGmailWatch failed for profile", profile.id, err);
        }
      }
    }

    return NextResponse.json({ ok: true, renewed: profiles?.length || 0 });
  } catch (error) {
    console.error("Watch renewal error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
