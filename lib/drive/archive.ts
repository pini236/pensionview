export function profileFolderName(profileName: string | null | undefined, profileId: string): string {
  const cleaned = (profileName ?? "").trim().replace(/\s+/g, " ");
  if (cleaned.length > 0) return cleaned;
  return `Profile-${profileId.slice(0, 8)}`;
}
