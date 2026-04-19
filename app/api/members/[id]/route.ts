// =============================================================================
// PensionView — Members CRUD API (per-id)
//   PATCH  /api/members/[id]  -> partial update
//   DELETE /api/members/[id]  -> soft delete (sets deleted_at)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";
import {
  AVATAR_COLOR_VALUES,
  RELATIONSHIP_VALUES,
  type AvatarColor,
  type Member,
  type Relationship,
} from "@/lib/types";

const NAME_MAX_LEN = 120;
const NATIONAL_ID_RE = /^\d{9}$/;

interface PatchInput {
  name?: string;
  relationship?: Relationship;
  avatar_color?: AvatarColor;
  date_of_birth?: string | null;
  national_id?: string | null;
}

interface ValidationOk { ok: true; value: PatchInput }
interface ValidationErr { ok: false; error: string }

function validatePatch(body: unknown): ValidationOk | ValidationErr {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  const out: PatchInput = {};

  if ("name" in b) {
    if (typeof b.name !== "string") return { ok: false, error: "name must be a string" };
    const name = b.name.trim();
    if (!name) return { ok: false, error: "name cannot be empty" };
    if (name.length > NAME_MAX_LEN) {
      return { ok: false, error: `name must be ≤ ${NAME_MAX_LEN} chars` };
    }
    out.name = name;
  }

  if ("relationship" in b) {
    const r = b.relationship as Relationship;
    if (!RELATIONSHIP_VALUES.includes(r)) {
      return { ok: false, error: `relationship must be one of ${RELATIONSHIP_VALUES.join(",")}` };
    }
    if (r === "self") {
      return { ok: false, error: "cannot change relationship to self" };
    }
    out.relationship = r;
  }

  if ("avatar_color" in b) {
    const c = b.avatar_color as AvatarColor;
    if (!AVATAR_COLOR_VALUES.includes(c)) {
      return { ok: false, error: `avatar_color must be one of ${AVATAR_COLOR_VALUES.join(",")}` };
    }
    out.avatar_color = c;
  }

  if ("date_of_birth" in b) {
    const dob = b.date_of_birth;
    if (dob === null || dob === "") {
      out.date_of_birth = null;
    } else if (typeof dob === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      out.date_of_birth = dob;
    } else {
      return { ok: false, error: "date_of_birth must be YYYY-MM-DD or null" };
    }
  }

  if ("national_id" in b) {
    const nid = b.national_id;
    if (nid === null || nid === "") {
      out.national_id = null;
    } else if (typeof nid === "string" && NATIONAL_ID_RE.test(nid)) {
      out.national_id = nid;
    } else {
      return { ok: false, error: "national_id must be 9 digits or null" };
    }
  }

  if (Object.keys(out).length === 0) {
    return { ok: false, error: "No updatable fields supplied" };
  }
  return { ok: true, value: out };
}

interface CallerContext {
  email: string;
  selfProfileId: string;
  householdId: string;
}

async function getCallerContext(): Promise<
  | { ok: true; ctx: CallerContext }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, status: 401, error: "Not authenticated" };

  const admin = createAdminClient();
  const { data: self } = await admin
    .from("profiles")
    .select("id, household_id")
    .eq("email", user.email)
    .eq("is_self", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!self) {
    return {
      ok: false,
      status: 403,
      error: "No self profile for caller; backfill not run?",
    };
  }
  return {
    ok: true,
    ctx: {
      email: user.email,
      selfProfileId: self.id,
      householdId: self.household_id,
    },
  };
}

interface ProfileRow {
  id: string;
  name: string | null;
  relationship: Relationship | null;
  avatar_color: AvatarColor | null;
  is_self: boolean;
  date_of_birth: string | null;
}

function rowToMember(row: ProfileRow): Member {
  return {
    id: row.id,
    name: row.name ?? "—",
    relationship: row.relationship ?? "other",
    avatar_color: row.avatar_color ?? "blue",
    is_self: row.is_self,
    date_of_birth: row.date_of_birth,
  };
}

/**
 * Confirms `memberId` belongs to the caller's household and is not archived.
 * Returns the row or an error response payload.
 */
async function loadOwnedMember(
  memberId: string,
  householdId: string
): Promise<
  | { ok: true; row: { id: string; is_self: boolean; deleted_at: string | null } }
  | { ok: false; status: number; error: string }
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, household_id, is_self, deleted_at")
    .eq("id", memberId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!data) return { ok: false, status: 404, error: "Member not found" };
  if (data.household_id !== householdId) {
    // Don't leak existence of other households.
    return { ok: false, status: 404, error: "Member not found" };
  }
  return {
    ok: true,
    row: { id: data.id, is_self: data.is_self, deleted_at: data.deleted_at },
  };
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const auth = await getCallerContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const owned = await loadOwnedMember(id, auth.ctx.householdId);
  if (!owned.ok) return NextResponse.json({ error: owned.error }, { status: owned.status });
  if (owned.row.deleted_at) {
    return NextResponse.json({ error: "Member is archived" }, { status: 410 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const valid = validatePatch(body);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    return NextResponse.json(
      { error: "Server misconfigured: ENCRYPTION_KEY missing" },
      { status: 500 }
    );
  }

  // Build the patch row. Only encrypt national_id when it's being changed.
  const update: Record<string, unknown> = {};
  if (valid.value.name !== undefined) update.name = valid.value.name;
  if (valid.value.relationship !== undefined) update.relationship = valid.value.relationship;
  if (valid.value.avatar_color !== undefined) update.avatar_color = valid.value.avatar_color;
  if (valid.value.date_of_birth !== undefined) update.date_of_birth = valid.value.date_of_birth;
  if ("national_id" in valid.value) {
    const nid = valid.value.national_id;
    update.national_id = nid == null ? null : encrypt(nid, encryptionKey);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update(update)
    .eq("id", id)
    .eq("household_id", auth.ctx.householdId) // belt + suspenders
    .select("id, name, relationship, avatar_color, is_self, date_of_birth")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to update member" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { member: rowToMember(data as ProfileRow) },
    { status: 200 }
  );
}

// ---------------------------------------------------------------------------
// DELETE — soft only in v1 (sets deleted_at). Self can never be deleted via
// this endpoint; that requires account closure.
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const auth = await getCallerContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const owned = await loadOwnedMember(id, auth.ctx.householdId);
  if (!owned.ok) return NextResponse.json({ error: owned.error }, { status: owned.status });

  if (owned.row.is_self) {
    return NextResponse.json(
      { error: "Cannot delete the self member" },
      { status: 409 }
    );
  }
  if (owned.row.deleted_at) {
    // Idempotent: already archived -> 200 with the same shape.
    return NextResponse.json({ ok: true, alreadyArchived: true });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("household_id", auth.ctx.householdId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
