import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let testClient: Client;

vi.mock("./client", () => ({
  getDbClient: () => testClient,
}));

beforeEach(() => {
  testClient = createClient({ url: ":memory:" });
});

afterEach(() => {
  testClient.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const FULL_SCOPE = "openid email profile https://www.googleapis.com/auth/presentations https://www.googleapis.com/auth/drive.file";

describe("google-tokens", () => {
  it("saveGoogleTokens/getGoogleTokens round-trips the refresh token decrypted", async () => {
    const { saveGoogleTokens, getGoogleTokens } = await import("./google-tokens");
    await saveGoogleTokens("user-1", { refreshToken: "refresh-abc", scope: FULL_SCOPE, accessToken: "access-abc", accessTokenExpiresAt: Date.now() + 60_000 });

    const tokens = await getGoogleTokens("user-1");
    expect(tokens?.refreshToken).toBe("refresh-abc");
    expect(tokens?.scope).toBe(FULL_SCOPE);
    expect(tokens?.accessToken).toBe("access-abc");
  });

  it("getGoogleTokens returns null when no row exists", async () => {
    const { getGoogleTokens } = await import("./google-tokens");
    expect(await getGoogleTokens("nobody")).toBeNull();
  });

  it("saveGoogleTokens upserts rather than duplicating rows", async () => {
    const { saveGoogleTokens, getGoogleTokens } = await import("./google-tokens");
    await saveGoogleTokens("user-1", { refreshToken: "first", scope: FULL_SCOPE });
    await saveGoogleTokens("user-1", { refreshToken: "second", scope: FULL_SCOPE });
    expect((await getGoogleTokens("user-1"))?.refreshToken).toBe("second");
  });

  it("hasSlidesScope is true only when both required scopes are present", async () => {
    const { saveGoogleTokens, hasSlidesScope } = await import("./google-tokens");
    await saveGoogleTokens("user-1", { refreshToken: "r", scope: FULL_SCOPE });
    await saveGoogleTokens("user-2", { refreshToken: "r", scope: "openid email profile" });
    expect(await hasSlidesScope("user-1")).toBe(true);
    expect(await hasSlidesScope("user-2")).toBe(false);
    expect(await hasSlidesScope("never-granted")).toBe(false);
  });

  it("saveDriveFolder/getDriveFolder round-trips the remembered folder", async () => {
    const { saveGoogleTokens, saveDriveFolder, getDriveFolder } = await import("./google-tokens");
    await saveGoogleTokens("user-1", { refreshToken: "r", scope: FULL_SCOPE });
    expect(await getDriveFolder("user-1")).toBeNull();
    await saveDriveFolder("user-1", "folder-123", "My Decks");
    expect(await getDriveFolder("user-1")).toEqual({ folderId: "folder-123", folderName: "My Decks" });
  });

  it("refreshAccessToken returns null with no network call when there's no stored token", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const { refreshAccessToken } = await import("./google-tokens");
    expect(await refreshAccessToken("nobody")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refreshAccessToken returns the cached access token without a network call when still fresh", async () => {
    const { saveGoogleTokens, refreshAccessToken } = await import("./google-tokens");
    await saveGoogleTokens("user-1", { refreshToken: "r", scope: FULL_SCOPE, accessToken: "still-fresh", accessTokenExpiresAt: Date.now() + 10 * 60_000 });

    const fetchSpy = vi.spyOn(global, "fetch");
    expect(await refreshAccessToken("user-1")).toBe("still-fresh");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refreshAccessToken hits the token endpoint and updates the row when the access token is expired", async () => {
    const { saveGoogleTokens, refreshAccessToken, getGoogleTokens } = await import("./google-tokens");
    await saveGoogleTokens("user-1", { refreshToken: "r", scope: FULL_SCOPE, accessToken: "stale", accessTokenExpiresAt: Date.now() - 1000 });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "fresh-access-token", expires_in: 3600 }),
      }),
    );

    const result = await refreshAccessToken("user-1");
    expect(result).toBe("fresh-access-token");
    expect(await getGoogleTokens("user-1")).toMatchObject({ accessToken: "fresh-access-token", refreshToken: "r" });
  });

  it("refreshAccessToken clears the row when the refresh token has been revoked", async () => {
    const { saveGoogleTokens, refreshAccessToken, getGoogleTokens } = await import("./google-tokens");
    await saveGoogleTokens("user-1", { refreshToken: "revoked", scope: FULL_SCOPE, accessToken: "stale", accessTokenExpiresAt: Date.now() - 1000 });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid_grant" }),
      }),
    );

    const result = await refreshAccessToken("user-1");
    expect(result).toBeNull();
    expect(await getGoogleTokens("user-1")).toBeNull();
  });

  it("refreshAccessToken leaves the row intact on a transient 5xx from Google's token endpoint", async () => {
    const { saveGoogleTokens, refreshAccessToken, getGoogleTokens } = await import("./google-tokens");
    await saveGoogleTokens("user-1", { refreshToken: "still-good", scope: FULL_SCOPE, accessToken: "stale", accessTokenExpiresAt: Date.now() - 1000 });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: "backend_error" }),
      }),
    );

    const result = await refreshAccessToken("user-1");
    expect(result).toBeNull();
    expect(await getGoogleTokens("user-1")).toMatchObject({ refreshToken: "still-good" });
  });

  it("refreshAccessToken leaves the row intact on a network-level failure", async () => {
    const { saveGoogleTokens, refreshAccessToken, getGoogleTokens } = await import("./google-tokens");
    await saveGoogleTokens("user-1", { refreshToken: "still-good", scope: FULL_SCOPE, accessToken: "stale", accessTokenExpiresAt: Date.now() - 1000 });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );

    const result = await refreshAccessToken("user-1");
    expect(result).toBeNull();
    expect(await getGoogleTokens("user-1")).toMatchObject({ refreshToken: "still-good" });
  });
});
