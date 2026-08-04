import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useGhostMode } from "./use-ghost-mode";

const STORAGE_KEY = "wayframe:ghost-preference";

describe("useGhostMode", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to on, style badge, when nothing is stored", async () => {
    const { result } = renderHook(() => useGhostMode());
    await waitFor(() => expect(result.current.mode).toBe("badge"));
    expect(result.current.enabled).toBe(true);
    expect(result.current.style).toBe("badge");
  });

  it("rehydrates a previously stored preference", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: false, style: "outline" }));
    const { result } = renderHook(() => useGhostMode());
    await waitFor(() => expect(result.current.enabled).toBe(false));
    expect(result.current.style).toBe("outline");
    expect(result.current.mode).toBe("off");
  });

  it("resolves mode to off when disabled, regardless of style", async () => {
    const { result } = renderHook(() => useGhostMode());
    await waitFor(() => expect(result.current.mode).toBe("badge"));

    act(() => result.current.setEnabled(false));
    await waitFor(() => expect(result.current.mode).toBe("off"));
    expect(result.current.style).toBe("badge");
  });

  it("remembers the chosen style after toggling off and back on", async () => {
    const { result } = renderHook(() => useGhostMode());
    await waitFor(() => expect(result.current.mode).toBe("badge"));

    act(() => result.current.setStyle("outline"));
    await waitFor(() => expect(result.current.style).toBe("outline"));

    act(() => result.current.setEnabled(false));
    await waitFor(() => expect(result.current.mode).toBe("off"));

    act(() => result.current.setEnabled(true));
    await waitFor(() => expect(result.current.mode).toBe("outline"));
  });

  it("persists enabled/style together to localStorage", async () => {
    const { result } = renderHook(() => useGhostMode());
    await waitFor(() => expect(result.current.mode).toBe("badge"));

    act(() => result.current.setStyle("outline"));
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
      expect(saved).toEqual({ enabled: true, style: "outline" });
    });
  });

  it("falls back to the default for corrupt stored data", async () => {
    window.localStorage.setItem(STORAGE_KEY, "not json");
    const { result } = renderHook(() => useGhostMode());
    await waitFor(() => expect(result.current.mode).toBe("badge"));
  });
});
