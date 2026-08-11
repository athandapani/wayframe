import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useFontScale, FONT_SCALE_MIN, FONT_SCALE_MAX } from "./use-font-scale";

const STORAGE_KEY = "wayframe:font-scale";

describe("useFontScale", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to 1 when nothing is stored", async () => {
    const { result } = renderHook(() => useFontScale());
    await waitFor(() => expect(result.current.scale).toBe(1));
  });

  it("rehydrates a previously stored scale", async () => {
    window.localStorage.setItem(STORAGE_KEY, "1.3");
    const { result } = renderHook(() => useFontScale());
    await waitFor(() => expect(result.current.scale).toBe(1.3));
  });

  it("persists a changed scale to localStorage", async () => {
    const { result } = renderHook(() => useFontScale());
    await waitFor(() => expect(result.current.scale).toBe(1));

    act(() => result.current.setScale(1.45));
    await waitFor(() => expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1.45"));
    expect(result.current.scale).toBe(1.45);
  });

  it("clamps a setScale call outside the allowed range", async () => {
    const { result } = renderHook(() => useFontScale());
    await waitFor(() => expect(result.current.scale).toBe(1));

    act(() => result.current.setScale(5));
    await waitFor(() => expect(result.current.scale).toBe(FONT_SCALE_MAX));

    act(() => result.current.setScale(0));
    await waitFor(() => expect(result.current.scale).toBe(FONT_SCALE_MIN));
  });

  it("falls back to the default for a stored value outside the allowed range", async () => {
    window.localStorage.setItem(STORAGE_KEY, "99");
    const { result } = renderHook(() => useFontScale());
    await waitFor(() => expect(result.current.scale).toBe(1));
  });

  it("falls back to the default for corrupt stored data", async () => {
    window.localStorage.setItem(STORAGE_KEY, "not a number");
    const { result } = renderHook(() => useFontScale());
    await waitFor(() => expect(result.current.scale).toBe(1));
  });
});
