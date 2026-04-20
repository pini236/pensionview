// =============================================================================
// PensionView — Server-side active member resolver (Family Mode)
// =============================================================================
//
// Source-of-truth order: URL `?member=<id|all>` -> cookie `pv_active_member`
// -> fallback to the self profile.
//
// Pages call this once at the top, then pass the result to query helpers in
// `lib/queries/active-member-queries.ts`. The cookie is written by the
// client-side switcher (so the value sticks across navigation without an
// extra server roundtrip).

import { cache } from "react";
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Member, Profile, Relationship, AvatarColor } from "@/lib/types";

// ---------------------------------------------------------------------------
// Public constants — shared between the server resolver, the client hook
// (`lib/hooks/useActiveMember.ts`) and the API routes.
// ---------------------------------------------------------------------------

export const ACTIVE_MEMBER_COOKIE = "pv_active_member";
export const ACTIVE_MEMBER_PARAM = "member";
export const ALL_MEMBERS_TOKEN = "all";

export type ActiveMember =
  | { kind: "single"; member: Member; householdMemberIds: string[]; members: Member[] }
  | { kind: "all"; members: Member[]; householdMemberIds: string[] };

type ProfileMemberFields = Pick<
  Profile,
  | "id"
  | "name"
  | "national_id"
  | "relationship"
  | "avatar_color"
  | "is_self"
  | "date_of_birth"
>;

function toMember(p: ProfileMemberFields): Member {
  return {
    id: p.id,
    name: p.name ?? "—",
    relationship: (p.relationship ?? "self") as Relationship,
    avatar_color: (p.avatar_color ?? "blue") as AvatarColor,
    is_self: !!p.is_self,
    date_of_birth: p.date_of_birth ?? null,
    national_id: p.national_id ?? null,
  };
}

export const getActiveMember = cache(async function _getActiveMember(searchParams: {
  member?: string;
}): Promise<ActiveMember> {
  const supabase = await createServerSupabase();
  const cookieStore = await cookies();

  const { data: { user } } = await supabase.auth.getUser();

  // Resolve the auth user's self profile so we can scope household_id.
  // Once RLS is installed by migration 003, we still need is_self=true here
  // because non-self profiles may also be visible (same household), and we
  // want the household anchor not just any visible row.
  const { data: selfProfile } = await supabase
    .from("profiles")
    .select(
      "id, name, national_id, relationship, avatar_color, is_self, date_of_birth, household_id"
    )
    .eq("email", user?.email ?? "")
    .eq("is_self", true)
    .maybeSingle();

  // Fetch all household members (or just the self profile if household_id
  // hasn't been backfilled yet — graceful degradation).
  let profiles: ProfileMemberFields[] = [];

  if (selfProfile?.household_id) {
    const { data } = await supabase
      .from("profiles")
      .select(
        "id, name, national_id, relationship, avatar_color, is_self, date_of_birth"
      )
      .eq("household_id", selfProfile.household_id)
      .is("deleted_at", null)
      .order("is_self", { ascending: false })
      .order("created_at", { ascending: true });
    profiles = (data ?? []) as ProfileMemberFields[];
  } else if (selfProfile) {
    profiles = [
      {
        id: selfProfile.id,
        name: selfProfile.name,
        national_id: selfProfile.national_id ?? null,
        relationship: (selfProfile.relationship ?? "self") as Relationship,
        avatar_color: (selfProfile.avatar_color ?? "blue") as AvatarColor,
        is_self: !!selfProfile.is_self,
        date_of_birth: selfProfile.date_of_birth ?? null,
      },
    ];
  }

  const members: Member[] = profiles.map(toMember);
  const householdMemberIds = members.map((m) => m.id);

  // Resolve selection: URL > cookie > self
  const urlParam = searchParams.member;
  const cookieParam = cookieStore.get(ACTIVE_MEMBER_COOKIE)?.value;
  const desired = urlParam ?? cookieParam ?? null;

  if (desired === ALL_MEMBERS_TOKEN && members.length > 0) {
    return { kind: "all", members, householdMemberIds };
  }

  if (desired && desired !== ALL_MEMBERS_TOKEN) {
    const match = members.find((m) => m.id === desired);
    if (match) {
      return {
        kind: "single",
        member: match,
        householdMemberIds: [match.id],
        members,
      };
    }
    // Stale token (deleted member, foreign household, etc.) — fall through
    // to self rather than 500 the page.
  }

  // Fallback: self
  const self = members.find((m) => m.is_self) ?? members[0];
  if (self) {
    return {
      kind: "single",
      member: self,
      householdMemberIds: [self.id],
      members,
    };
  }

  // No members at all (edge case during onboarding)
  return { kind: "all", members: [], householdMemberIds: [] };
});
