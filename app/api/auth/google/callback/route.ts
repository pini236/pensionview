import { NextRequest, NextResponse } from "next/server";
import { getGoogleTokens } from "@/lib/google-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";

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

  await admin
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
    .eq("email", user.email);

  return NextResponse.redirect(`${origin}/he/settings?connected=true`);
}
