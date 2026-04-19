import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "@/lib/crypto";

const TEST_KEY = "a".repeat(64); // 32 bytes in hex = 256-bit key

describe("encrypt / decrypt", () => {
  it("encrypts and decrypts correctly", () => {
    const plaintext = "pension-data-secret";
    const encrypted = encrypt(plaintext, TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext each time (random IV)", () => {
    const plaintext = "same-input";
    const a = encrypt(plaintext, TEST_KEY);
    const b = encrypt(plaintext, TEST_KEY);
    expect(a).not.toBe(b);
  });

  it("fails to decrypt with the wrong key", () => {
    const plaintext = "sensitive";
    const encrypted = encrypt(plaintext, TEST_KEY);
    const wrongKey = "b".repeat(64);
    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });
});
