// =============================================================================
// PensionView — Member restore endpoint
//   POST /api/members/[id]/restore  -> un-archive a soft-deleted member
//
// Mirrors the auth + household-ownership pattern from
// /api/members/[id]/route.ts. Cannot restore the self row (it should never
// be archived in the first place; that requires account closure).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  // Auth: resolve caller -> household via their self profile.
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: self } = await admin
    .from("profiles")
    .select("household_id")
    .eq("email", user.email)
    .eq("is_self", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!self) {
    return NextResponse.json({ error: "no household" }, { status: 403 });
  }

  // Verify the target belongs to this household and is currently archived.
  const { data: target, error: targetErr } = await admin
    .from("profiles")
    .select("id, household_id, deleted_at, is_self")
    .eq("id", id)
    .maybeSingle();

  if (targetErr) {
    return NextResponse.json({ error: targetErr.message }, { status: 500 });
  }
  if (!target || target.household_id !== self.household_id) {
    // Don't leak existence of other households.
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (target.is_self) {
    return NextResponse.json(
      { error: "cannot restore self" },
      { status: 400 }
    );
  }
  if (!target.deleted_at) {
    return NextResponse.json(
      { error: "member is not archived" },
      { status: 400 }
    );
  }

  const { error } = await admin
    .from("profiles")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("household_id", self.household_id); // belt + suspenders

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
