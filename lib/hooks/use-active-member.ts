"use client";

import { useCallback, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { Member } from "@/lib/types";

export type ActiveMemberSelection =
  | { kind: "all" }
  | { kind: "single"; member: Member };

/**
 * Describes the server-resolved active member that the layout passes down so
 * the client picker starts in sync with the server on first paint.
 */
export type InitialActive =
  | { kind: "all" }
  | { kind: "single"; memberId: string };

/**
 * Client-side hook that mirrors `getActiveMember()` on the server.
 *
 * Source of truth priority:
 *   1. URL `?member=<id|all>` — user navigated to a URL with the param.
 *   2. `initialActive` — server-resolved value threaded down from the layout.
 *      This covers the common case where the user selects a member, navigates
 *      via bottom-nav (which strips query params), and the server correctly
 *      read the cookie — but the client would otherwise fall back to is_self.
 *   3. Fallback to `is_self` — edge case when neither URL nor server context
 *      has a usable value.
 *
 * `setActive` pushes a new URL with the param set; the server reads it on the
 * next render and writes the cookie back via `getActiveMember`.
 */
export function useActiveMember(
  members: Member[],
  initialActive?: InitialActive,
): {
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
    // 1. URL param wins — explicit navigation.
    if (param === "all") {
      return { activeMemberId: "all", active: { kind: "all" } };
    }
    if (param) {
      const match = members.find((m) => m.id === param);
      if (match) {
        return { activeMemberId: match.id, active: { kind: "single", member: match } };
      }
    }

    // 2. Server-resolved initial value — covers post-navigation renders where
    //    the URL param was stripped but the server correctly read the cookie.
    if (initialActive) {
      if (initialActive.kind === "all") {
        return { activeMemberId: "all", active: { kind: "all" } };
      }
      const match = members.find((m) => m.id === initialActive.memberId);
      if (match) {
        return { activeMemberId: match.id, active: { kind: "single", member: match } };
      }
    }

    // 3. Fallback: self if present, else first member, else "all".
    const self = members.find((m) => m.is_self) ?? members[0];
    if (self) {
      return {
        activeMemberId: self.id,
        active: { kind: "single", member: self },
      };
    }
    return { activeMemberId: "all", active: { kind: "all" } };
  }, [param, members, initialActive]);

  const setActive = useCallback(
    (id: string | "all") => {
      // Persist to cookie so the server reads the right member on the next
      // navigation. Server reads URL > cookie > self.
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
