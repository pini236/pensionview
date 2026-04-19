"use client";

import { clsx } from "clsx";
import { MemberAvatar } from "./MemberAvatar";
import type { Member } from "@/lib/types";

interface MemberPillProps {
  member: Pick<Member, "id" | "name" | "avatar_color" | "is_self">;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Avatar circle + name in a rounded pill. Used in the topbar trigger,
 * dropdown rows, and HouseholdHero quick-glances.
 */
export function MemberPill({ member, size = "md", className }: MemberPillProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 rounded-full bg-surface px-2 py-1",
        size === "sm" ? "text-xs" : "text-sm",
        className
      )}
    >
      <MemberAvatar member={member} size={size === "sm" ? "sm" : "md"} />
      <span className="truncate font-medium text-text-primary">
        {member.name}
      </span>
    </span>
  );
}
