import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Shape } from "@/lib/export/deck-ir";

const authMock = vi.fn();
vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));

const refreshAccessTokenMock = vi.fn();
vi.mock("@/lib/db/google-tokens", () => ({ refreshAccessToken: refreshAccessTokenMock }));

const exportSlideDeckMock = vi.fn();
const moveFileMock = vi.fn();
vi.mock("@/lib/google/slides-api", () => ({
  exportSlideDeckToGoogleSlides: exportSlideDeckMock,
  moveFileToFolder: moveFileMock,
}));

beforeEach(() => {
  authMock.mockReset();
  refreshAccessTokenMock.mockReset();
  exportSlideDeckMock.mockReset();
  moveFileMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "user-1" } });
  refreshAccessTokenMock.mockResolvedValue("access-token");
  exportSlideDeckMock.mockResolvedValue({ presentationId: "pres-1", presentationUrl: "https://docs.google.com/presentation/d/pres-1/edit" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const rect: Shape = { id: "r1", kind: "rect", x: 0, y: 0, w: 1, h: 1, fill: "#112233" };

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/google/slides-export", { method: "POST", body: JSON.stringify(body) });
}

async function callRoute(body: unknown) {
  const { POST } = await import("./route");
  return POST(postRequest(body));
}

describe("POST /api/google/slides-export", () => {
  it("401s when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await callRoute({ slides: [[rect]], fileName: "x" });
    expect(res.status).toBe(401);
  });

  it("403s with no_valid_token when the user has no valid Slides token", async () => {
    refreshAccessTokenMock.mockResolvedValue(null);
    const res = await callRoute({ slides: [[rect]], fileName: "x" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "no_valid_token" });
  });

  it("400s when slides is missing or empty", async () => {
    const res = await callRoute({ fileName: "x" });
    expect(res.status).toBe(400);
  });

  it("400s on invalid shape IR", async () => {
    const res = await callRoute({ slides: [[{ kind: "rect" }]], fileName: "x" });
    expect(res.status).toBe(400);
  });

  it("200s with the presentation URL on success", async () => {
    const res = await callRoute({ slides: [[rect]], fileName: "My Deck" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ presentationUrl: "https://docs.google.com/presentation/d/pres-1/edit" });
    expect(exportSlideDeckMock).toHaveBeenCalledWith("access-token", [[rect]], "My Deck");
    expect(moveFileMock).not.toHaveBeenCalled();
  });

  it("moves the file into the given Drive folder when driveFolderId is provided", async () => {
    await callRoute({ slides: [[rect]], fileName: "x", driveFolderId: "folder-1" });
    expect(moveFileMock).toHaveBeenCalledWith("access-token", "pres-1", "folder-1");
  });

  it("502s with a typed error body when the Slides API call fails", async () => {
    exportSlideDeckMock.mockRejectedValue(new Error("boom"));
    const res = await callRoute({ slides: [[rect]], fileName: "x" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "google_api_error", detail: "boom" });
  });
});
