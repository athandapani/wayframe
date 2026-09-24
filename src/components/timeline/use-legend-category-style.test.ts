import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useLegendCategoryStyle } from "./use-legend-category-style";

const STORAGE_KEY = "wayframe:legend-category-style";
const VERSION_KEY = `${STORAGE_KEY}:default-v`;
const CURRENT_VERSION = "2";

describe("useLegendCategoryStyle (wayframe#147 — a default change has to reach the browsers that would notice it)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to on with nothing stored", async () => {
    const { result } = renderHook(() => useLegendCategoryStyle());
    await waitFor(() => expect(result.current.enabled).toBe(true));
  });

  it("discards a value stored under an older default, and says so by stamping the current one", async () => {
    // Exactly the state #143 shipped into: every browser that had ever
    // loaded the app carried a "false" written by the old
    // write-back-on-hydrate effect, with nothing marking it as a choice.
    window.localStorage.setItem(STORAGE_KEY, "false");
    const { result } = renderHook(() => useLegendCategoryStyle());
    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(VERSION_KEY)).toBe(CURRENT_VERSION);
  });

  it("honours a deliberate off, stored against the current default", async () => {
    window.localStorage.setItem(STORAGE_KEY, "false");
    window.localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
    const { result } = renderHook(() => useLegendCategoryStyle());
    await waitFor(() => expect(result.current.enabled).toBe(false));
  });

  it("stores nothing until the viewer actually toggles — which is what makes a stored value mean a choice", async () => {
    const { result } = renderHook(() => useLegendCategoryStyle());
    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    act(() => result.current.setEnabled(false));
    await waitFor(() => expect(result.current.enabled).toBe(false));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("false");
    expect(window.localStorage.getItem(VERSION_KEY)).toBe(CURRENT_VERSION);
  });

  it("survives a remount once toggled off — the choice sticks where the old default didn't", async () => {
    const first = renderHook(() => useLegendCategoryStyle());
    await waitFor(() => expect(first.result.current.enabled).toBe(true));
    act(() => first.result.current.setEnabled(false));
    first.unmount();

    const second = renderHook(() => useLegendCategoryStyle());
    await waitFor(() => expect(second.result.current.enabled).toBe(false));
  });
});
