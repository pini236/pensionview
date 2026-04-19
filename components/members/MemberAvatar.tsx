"use client";

import { clsx } from "clsx";
import { AVATAR_COLOR_HEX, getInitials } from "@/lib/avatar";
import type { Member } from "@/lib/types";

interface MemberAvatarProps {
  member: Pick<Member, "name" | "avatar_color">;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses: Record<NonNullable<MemberAvatarProps["size"]>, string> = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
};

/**
 * Solid-color circle with the member's initials. Pure presentational —
 * background is the member's avatar color, text is forced white for contrast
 * across both light and dark themes (the palette colors are mid-tone).
 */
export function MemberAvatar({
  member,
  size = "md",
  className,
}: MemberAvatarProps) {
  const bg = AVATAR_COLOR_HEX[member.avatar_color];
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold leading-none text-white",
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: bg }}
    >
      {getInitials(member.name)}
    </span>
  );
}
