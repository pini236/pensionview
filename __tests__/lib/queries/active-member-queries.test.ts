import { describe, it, expect } from "vitest";
import {
  getHouseholdMemberIds,
  getHouseholdMembers,
  isSingleMember,
  findMember,
} from "@/lib/queries/active-member-queries";
import type { ActiveMember } from "@/lib/active-member";
import type { Member } from "@/lib/types";

const SELF: Member = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Pini",
  relationship: "self",
  avatar_color: "blue",
  is_self: true,
};
const SPOUSE: Member = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Miri",
  relationship: "spouse",
  avatar_color: "purple",
  is_self: false,
};

const SINGLE: ActiveMember = {
  kind: "single",
  member: SELF,
  members: [SELF, SPOUSE],
  householdMemberIds: [SELF.id],
};

const ALL: ActiveMember = {
  kind: "all",
  members: [SELF, SPOUSE],
  householdMemberIds: [SELF.id, SPOUSE.id],
};

describe("active-member-queries selectors", () => {
  it("getHouseholdMemberIds returns single id in single mode", () => {
    expect(getHouseholdMemberIds(SINGLE)).toEqual([SELF.id]);
  });

  it("getHouseholdMemberIds returns all ids in all mode", () => {
    expect(getHouseholdMemberIds(ALL)).toEqual([SELF.id, SPOUSE.id]);
  });

  it("getHouseholdMembers always returns the full list", () => {
    expect(getHouseholdMembers(SINGLE)).toHaveLength(2);
    expect(getHouseholdMembers(ALL)).toHaveLength(2);
  });

  it("isSingleMember narrows correctly", () => {
    expect(isSingleMember(SINGLE)).toBe(true);
    expect(isSingleMember(ALL)).toBe(false);
  });

  it("findMember locates by id and returns null when missing", () => {
    expect(findMember(SINGLE, SPOUSE.id)?.name).toBe("Miri");
    expect(findMember(ALL, "no-such-id")).toBeNull();
  });
});
