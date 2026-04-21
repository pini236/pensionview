// =============================================================================
// PensionView — Gmail watch diagnostic / refresh endpoint
//   GET /api/admin/gmail-watch
//
// Auth-gated by the caller's session (no service-role secret needed). Looks
// up the caller's self profile, calls setupGmailWatch, returns the raw
// success or failure surface so we can debug Pub/Sub subscription issues
// without redeploying every time.
//
// Useful for:
//   - Confirming the watch can be established at all (scopes, topic perms)
//   - Reading back the historyId Gmail issued
//   - Manually re-establishing a watch after the daily cron's window is missed
// =============================================================================

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setupGmailWatch } from "@/lib/gmail";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: self } = await admin
    .from("profiles")
    .select("id, email, google_access_token, google_token_expiry")
    .eq("email", user.email)
    .eq("is_self", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!self) {
    return NextResponse.json(
      { error: "No self profile for caller" },
      { status: 403 }
    );
  }

  if (!self.google_access_token) {
    return NextResponse.json(
      {
        ok: false,
        profileId: self.id,
        email: self.email,
        reason: "no_google_token",
        hint: "Connect Google in /he/settings first.",
      },
      { status: 200 }
    );
  }

  try {
    const watch = await setupGmailWatch(self.id);
    return NextResponse.json(
      {
        ok: true,
        profileId: self.id,
        email: self.email,
        historyId: (watch as { historyId?: string }).historyId ?? null,
        expiration: (watch as { expiration?: string }).expiration ?? null,
        topic: process.env.GOOGLE_PUBSUB_TOPIC ?? null,
        tokenExpiry: self.google_token_expiry,
      },
      { status: 200 }
    );
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json(
      {
        ok: false,
        profileId: self.id,
        email: self.email,
        reason: "watch_setup_failed",
        message: error.message,
        // googleapis errors stuff useful detail on `.errors` and `.code`
        code: (err as { code?: number | string }).code ?? null,
        details: (err as { errors?: unknown }).errors ?? null,
        topic: process.env.GOOGLE_PUBSUB_TOPIC ?? null,
      },
      { status: 200 }
    );
  }
}
