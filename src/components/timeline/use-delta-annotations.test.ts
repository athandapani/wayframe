import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDeltaAnnotations } from "./use-delta-annotations";

const STORAGE_KEY = "wayframe:delta-annotations-preference";

describe("useDeltaAnnotations", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to on when nothing is stored", async () => {
    const { result } = renderHook(() => useDeltaAnnotations());
    await waitFor(() => expect(result.current.enabled).toBe(true));
  });

  it("rehydrates a previously stored preference", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(false));
    const { result } = renderHook(() => useDeltaAnnotations());
    await waitFor(() => expect(result.current.enabled).toBe(false));
  });

  it("toggles off and back on", async () => {
    const { result } = renderHook(() => useDeltaAnnotations());
    await waitFor(() => expect(result.current.enabled).toBe(true));

    act(() => result.current.setEnabled(false));
    await waitFor(() => expect(result.current.enabled).toBe(false));

    act(() => result.current.setEnabled(true));
    await waitFor(() => expect(result.current.enabled).toBe(true));
  });

  it("persists to localStorage", async () => {
    const { result } = renderHook(() => useDeltaAnnotations());
    await waitFor(() => expect(result.current.enabled).toBe(true));

    act(() => result.current.setEnabled(false));
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
      expect(saved).toBe(false);
    });
  });

  it("falls back to the default for corrupt stored data", async () => {
    window.localStorage.setItem(STORAGE_KEY, "not json");
    const { result } = renderHook(() => useDeltaAnnotations());
    await waitFor(() => expect(result.current.enabled).toBe(true));
  });
});
