import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "./token-crypto";

describe("token-crypto", () => {
  it("round-trips a refresh token through encrypt/decrypt", async () => {
    const plain = "1//0g-fake-refresh-token-value";
    const encrypted = await encryptToken(plain);
    expect(encrypted).not.toContain(plain);
    expect(await decryptToken(encrypted)).toBe(plain);
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const a = await encryptToken("same-plaintext");
    const b = await encryptToken("same-plaintext");
    expect(a).not.toBe(b);
  });

  it("rejects cleanly on malformed input, instead of crashing", async () => {
    await expect(decryptToken("not-a-valid-encoded-token")).rejects.toThrow();
    await expect(decryptToken("garbage.ciphertext")).rejects.toThrow();
  });
});
