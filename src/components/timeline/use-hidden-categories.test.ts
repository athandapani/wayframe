import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useHiddenCategories } from "./use-hidden-categories";

const STORAGE_KEY = "wayframe:hidden-categories";

describe("useHiddenCategories", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to nothing hidden when nothing is stored", async () => {
    const { result } = renderHook(() => useHiddenCategories());
    await waitFor(() => expect(result.current.hiddenIds.size).toBe(0));
    expect(result.current.isHidden("cat-1")).toBe(false);
  });

  it("toggle adds a category to the hidden set", async () => {
    const { result } = renderHook(() => useHiddenCategories());
    await waitFor(() => expect(result.current.hiddenIds.size).toBe(0));

    act(() => result.current.toggle("cat-1"));
    await waitFor(() => expect(result.current.isHidden("cat-1")).toBe(true));
    expect(result.current.hiddenIds.has("cat-1")).toBe(true);
  });

  it("toggle again removes it from the hidden set", async () => {
    const { result } = renderHook(() => useHiddenCategories());
    await waitFor(() => expect(result.current.hiddenIds.size).toBe(0));

    act(() => result.current.toggle("cat-1"));
    await waitFor(() => expect(result.current.isHidden("cat-1")).toBe(true));

    act(() => result.current.toggle("cat-1"));
    await waitFor(() => expect(result.current.isHidden("cat-1")).toBe(false));
    expect(result.current.hiddenIds.has("cat-1")).toBe(false);
  });

  it("tracks multiple hidden categories independently", async () => {
    const { result } = renderHook(() => useHiddenCategories());
    await waitFor(() => expect(result.current.hiddenIds.size).toBe(0));

    act(() => result.current.toggle("cat-1"));
    act(() => result.current.toggle("cat-2"));
    await waitFor(() => expect(result.current.hiddenIds.size).toBe(2));
    expect(result.current.isHidden("cat-1")).toBe(true);
    expect(result.current.isHidden("cat-2")).toBe(true);
    expect(result.current.isHidden("cat-3")).toBe(false);
  });

  it("rehydrates a previously stored set", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["cat-1", "cat-2"]));
    const { result } = renderHook(() => useHiddenCategories());
    await waitFor(() => expect(result.current.hiddenIds.size).toBe(2));
    expect(result.current.isHidden("cat-1")).toBe(true);
    expect(result.current.isHidden("cat-2")).toBe(true);
  });

  it("persists the hidden set to localStorage as a JSON array", async () => {
    const { result } = renderHook(() => useHiddenCategories());
    await waitFor(() => expect(result.current.hiddenIds.size).toBe(0));

    act(() => result.current.toggle("cat-1"));
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
      expect(saved).toEqual(["cat-1"]);
    });
  });

  it("falls back to the default for corrupt stored data", async () => {
    window.localStorage.setItem(STORAGE_KEY, "not json");
    const { result } = renderHook(() => useHiddenCategories());
    await waitFor(() => expect(result.current.hiddenIds.size).toBe(0));
  });
});
