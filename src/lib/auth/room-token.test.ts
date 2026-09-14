import { describe, expect, it, vi } from "vitest";
import { mintRoomToken, verifyRoomToken } from "./room-token";

describe("room-token", () => {
  it("round-trips a minted token back to its identity", async () => {
    const token = await mintRoomToken("user-1", 300, "test-secret");
    const payload = await verifyRoomToken(token, "test-secret");
    expect(payload?.sub).toBe("user-1");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await mintRoomToken("user-1", 300, "test-secret");
    expect(await verifyRoomToken(token, "wrong-secret")).toBeNull();
  });

  it("rejects a tampered payload even if the signature segment is untouched", async () => {
    const token = await mintRoomToken("user-1", 300, "test-secret");
    const [, signature] = token.split(".");
    const tampered = `${btoa(JSON.stringify({ sub: "attacker", exp: 9999999999 })).replace(/=+$/, "")}.${signature}`;
    expect(await verifyRoomToken(tampered, "test-secret")).toBeNull();
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers();
    try {
      const token = await mintRoomToken("user-1", 1, "test-secret");
      vi.advanceTimersByTime(2000);
      expect(await verifyRoomToken(token, "test-secret")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects malformed tokens without throwing", async () => {
    expect(await verifyRoomToken("not-a-token", "test-secret")).toBeNull();
    expect(await verifyRoomToken("", "test-secret")).toBeNull();
  });
});
