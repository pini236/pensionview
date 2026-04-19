"use client";

import { useMemo, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { Member } from "@/lib/types";

export type ActiveMemberSelection =
  | { kind: "all" }
  | { kind: "single"; member: Member };

/**
 * Client-side hook that mirrors `getActiveMember()` on the server.
 *
 * Source of truth: URL `?member=<id|all>`. We intentionally don't read the
 * cookie here because the server has already resolved it on first paint —
 * client just needs to react to URL changes the user makes via the switcher.
 *
 * `setActive` pushes a new URL with the param set; the server reads it on the
 * next render and writes the cookie back via `getActiveMember`.
 */
export function useActiveMember(members: Member[]): {
  activeMemberId: string | "all";
  active: ActiveMemberSelection;
  setActive: (id: string | "all") => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const param = searchParams?.get("member") ?? null;

  const { activeMemberId, active } = useMemo<{
    activeMemberId: string | "all";
    active: ActiveMemberSelection;
  }>(() => {
    if (param === "all") {
      return { activeMemberId: "all", active: { kind: "all" } };
    }
    if (param) {
      const match = members.find((m) => m.id === param);
      if (match) {
        return { activeMemberId: match.id, active: { kind: "single", member: match } };
      }
    }
    // Fallback: self if present, else first member, else "all"
    const self = members.find((m) => m.is_self) ?? members[0];
    if (self) {
      return {
        activeMemberId: self.id,
        active: { kind: "single", member: self },
      };
    }
    return { activeMemberId: "all", active: { kind: "all" } };
  }, [param, members]);

  const setActive = useCallback(
    (id: string | "all") => {
      // Persist to cookie so navigation between tabs (which drops query params)
      // still respects the user's selection. Server reads URL > cookie > self.
      if (typeof document !== "undefined") {
        document.cookie = `pv_active_member=${id}; path=/; samesite=lax; max-age=31536000`;
      }
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("member", id);
      const qs = params.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ""}`);
    },
    [pathname, router, searchParams],
  );

  return { activeMemberId, active, setActive };
}
