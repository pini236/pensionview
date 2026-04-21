import { describe, it, expect } from "vitest";
import { profileFolderName } from "@/lib/drive/archive";

describe("profileFolderName", () => {
  it("returns the trimmed name when present", () => {
    expect(profileFolderName("  Pini  ", "id-1")).toBe("Pini");
  });

  it("collapses internal whitespace runs to a single space", () => {
    expect(profileFolderName("Yossi   Cohen", "id-1")).toBe("Yossi Cohen");
  });

  it("falls back to Profile-<first 8 chars of id> when name is null", () => {
    expect(profileFolderName(null, "abcdef0123456789-rest")).toBe("Profile-abcdef01");
  });

  it("falls back to Profile-<first 8 chars of id> when name is empty string", () => {
    expect(profileFolderName("", "abcdef0123456789-rest")).toBe("Profile-abcdef01");
  });

  it("falls back when name is whitespace only", () => {
    expect(profileFolderName("   \t  ", "abcdef0123456789-rest")).toBe("Profile-abcdef01");
  });
});
