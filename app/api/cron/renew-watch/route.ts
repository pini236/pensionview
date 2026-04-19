import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setupGmailWatch } from "@/lib/gmail";

export async function GET() {
  try {
    const admin = createAdminClient();
    const { data: profiles } = await admin.from("profiles")
      .select("id")
      .not("google_access_token", "is", null);

    if (profiles) {
      for (const profile of profiles) {
        await setupGmailWatch(profile.id).catch(console.error);
      }
    }

    return NextResponse.json({ ok: true, renewed: profiles?.length || 0 });
  } catch (error) {
    console.error("Watch renewal error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
