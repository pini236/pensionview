// =============================================================================
// PensionView — Avatar palette + helpers (Family Mode)
// =============================================================================

export type AvatarColor = "blue" | "purple" | "amber" | "green" | "cyan";

export const AVATAR_COLORS: AvatarColor[] = [
  "blue",
  "purple",
  "amber",
  "green",
  "cyan",
];

// Hex values are aligned with the existing design tokens / FUND_COLORS so the
// member identity reads as part of the same visual language.
export const AVATAR_COLOR_HEX: Record<AvatarColor, string> = {
  blue: "#3B82F6",
  purple: "#A78BFA",
  amber: "#F59E0B",
  green: "#22C55E",
  cyan: "#06B6D4",
};

// Tailwind-arbitrary-value-friendly text colors. We deliberately mirror the
// hex map so consumers can choose between background / text usage at a glance.
export const AVATAR_COLOR_TEXT: Record<AvatarColor, string> = AVATAR_COLOR_HEX;

/** Auto-pick the next color, avoiding ones already in use when possible. */
export function nextAvatarColor(taken: AvatarColor[]): AvatarColor {
  for (const c of AVATAR_COLORS) {
    if (!taken.includes(c)) return c;
  }
  return AVATAR_COLORS[taken.length % AVATAR_COLORS.length];
}

/**
 * Generate up to two-character initials from a name.
 * - "Pini Zonenshtein" → "PZ"
 * - "מירי לוי" → "מל"
 * - "Pini" → "P"
 * - empty / null → "?"
 */
export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    // Take first character of the only word; supports Hebrew, Latin, emoji
    const first = Array.from(parts[0])[0];
    return (first ?? "?").toLocaleUpperCase();
  }
  const first = Array.from(parts[0])[0] ?? "";
  const last = Array.from(parts[parts.length - 1])[0] ?? "";
  return (first + last).toLocaleUpperCase();
}
