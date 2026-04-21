import { NextRequest, NextResponse } from "next/server";
import { getGoogleTokens } from "@/lib/google-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { setupGmailWatch } from "@/lib/gmail";
import { logEvent } from "@/lib/observability";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/he/settings?error=no_code`);
  }

  const tokens = await getGoogleTokens(code);
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.redirect(`${origin}/he/login`);
  }

  const admin = createAdminClient();
  const key = process.env.ENCRYPTION_KEY!;

  const { data: updated } = await admin
    .from("profiles")
    .update({
      google_access_token: encrypt(tokens.access_token!, key),
      google_refresh_token: tokens.refresh_token
        ? encrypt(tokens.refresh_token, key)
        : undefined,
      google_token_expiry: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : undefined,
    })
    .eq("email", user.email)
    .select("id")
    .maybeSingle();

  // Subscribe the user's Gmail to Pub/Sub push notifications immediately.
  // Without this the daily renew-watch cron is the only path to a live
  // watch, which means a fresh Google connection sits inert until 6am UTC
  // — every forwarded report between connect and the next cron run is
  // silently dropped. Failures here are non-fatal: the user is already
  // connected, and the next cron tick will retry.
  if (updated?.id) {
    try {
      await setupGmailWatch(updated.id);
    } catch (err) {
      logEvent("gmail.watch_setup_failed", {
        feature: "gmail",
        profileId: updated.id,
        error: err,
      });
    }
  }

  return NextResponse.redirect(`${origin}/he/settings?connected=true`);
}
