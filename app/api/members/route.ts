// =============================================================================
// PensionView — Members CRUD API
//   POST /api/members  -> create a household member
//   GET  /api/members  -> list household members (non-archived)
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

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const NAME_MAX_LEN = 120;
const NATIONAL_ID_RE = /^\d{9}$/;

interface CreateMemberInput {
  name: string;
  relationship: Relationship;
  avatar_color: AvatarColor;
  date_of_birth?: string | null;
  national_id?: string | null;
  is_self?: boolean; // ignored — only one self per household, set during backfill
}

interface ValidationOk { ok: true; value: CreateMemberInput }
interface ValidationErr { ok: false; error: string }

function validateCreate(body: unknown): ValidationOk | ValidationErr {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { ok: false, error: "name is required" };
  if (name.length > NAME_MAX_LEN) {
    return { ok: false, error: `name must be ≤ ${NAME_MAX_LEN} chars` };
  }

  const relationship = b.relationship as Relationship;
  if (!RELATIONSHIP_VALUES.includes(relationship)) {
    return { ok: false, error: `relationship must be one of ${RELATIONSHIP_VALUES.join(",")}` };
  }
  if (relationship === "self") {
    return { ok: false, error: "cannot create a new self member; one already exists" };
  }

  const avatar_color = b.avatar_color as AvatarColor;
  if (!AVATAR_COLOR_VALUES.includes(avatar_color)) {
    return { ok: false, error: `avatar_color must be one of ${AVATAR_COLOR_VALUES.join(",")}` };
  }

  const dob = b.date_of_birth;
  if (dob != null && (typeof dob !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dob))) {
    return { ok: false, error: "date_of_birth must be YYYY-MM-DD" };
  }

  const nid = b.national_id;
  if (nid != null && nid !== "") {
    if (typeof nid !== "string" || !NATIONAL_ID_RE.test(nid)) {
      return { ok: false, error: "national_id must be 9 digits" };
    }
  }

  return {
    ok: true,
    value: {
      name,
      relationship,
      avatar_color,
      date_of_birth: typeof dob === "string" ? dob : null,
      national_id: typeof nid === "string" && nid !== "" ? nid : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Auth helper — resolves the auth user's household via their self profile.
//
// We use the user-scoped client to read the *email* (the only thing we trust
// from the JWT) but flip to admin for the household lookup so that even if
// RLS is mid-deploy we get a deterministic answer.
// ---------------------------------------------------------------------------

interface CallerContext {
  userId: string;
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
      userId: user.id,
      email: user.email,
      selfProfileId: self.id,
      householdId: self.household_id,
    },
  };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

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
    // national_id intentionally omitted from list/POST responses (encrypted
    // at rest; only edit screen ever exposes a redacted hint).
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function GET() {
  const auth = await getCallerContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, name, relationship, avatar_color, is_self, date_of_birth")
    .eq("household_id", auth.ctx.householdId)
    .is("deleted_at", null)
    .order("is_self", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const members: Member[] = (data ?? []).map((r) => rowToMember(r as ProfileRow));
  return NextResponse.json({ members });
}

export async function POST(request: NextRequest) {
  const auth = await getCallerContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const valid = validateCreate(body);
  if (!valid.ok) {
    return NextResponse.json({ error: valid.error }, { status: 400 });
  }

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    return NextResponse.json(
      { error: "Server misconfigured: ENCRYPTION_KEY missing" },
      { status: 500 }
    );
  }

  const admin = createAdminClient();
  const insertRow: Record<string, unknown> = {
    name: valid.value.name,
    relationship: valid.value.relationship,
    avatar_color: valid.value.avatar_color,
    household_id: auth.ctx.householdId,
    is_self: false,
    date_of_birth: valid.value.date_of_birth,
  };
  if (valid.value.national_id) {
    insertRow.national_id = encrypt(valid.value.national_id, encryptionKey);
  }

  const { data, error } = await admin
    .from("profiles")
    .insert(insertRow)
    .select("id, name, relationship, avatar_color, is_self, date_of_birth")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create member" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { member: rowToMember(data as ProfileRow) },
    { status: 200 }
  );
}
