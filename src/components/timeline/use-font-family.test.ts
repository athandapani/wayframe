import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useFontFamily } from "./use-font-family";

const STORAGE_KEY = "wayframe:font-family";

describe("useFontFamily", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to 'default' (no override) when nothing is stored", async () => {
    const { result } = renderHook(() => useFontFamily());
    await waitFor(() => expect(result.current.familyId).toBe("default"));
    expect(result.current.fontFamily).toBeUndefined();
  });

  it("rehydrates a previously stored family and resolves its stack", async () => {
    window.localStorage.setItem(STORAGE_KEY, "mono");
    const { result } = renderHook(() => useFontFamily());
    await waitFor(() => expect(result.current.familyId).toBe("mono"));
    expect(result.current.fontFamily).toContain("Consolas");
  });

  it("persists a changed family to localStorage and back to undefined on 'default'", async () => {
    const { result } = renderHook(() => useFontFamily());
    await waitFor(() => expect(result.current.familyId).toBe("default"));

    act(() => result.current.setFamily("serif"));
    await waitFor(() => expect(window.localStorage.getItem(STORAGE_KEY)).toBe("serif"));
    expect(result.current.fontFamily).toContain("Georgia");

    act(() => result.current.setFamily("default"));
    await waitFor(() => expect(result.current.fontFamily).toBeUndefined());
  });

  it("falls back to the default for an unrecognized stored id", async () => {
    window.localStorage.setItem(STORAGE_KEY, "not-a-real-family");
    const { result } = renderHook(() => useFontFamily());
    await waitFor(() => expect(result.current.familyId).toBe("default"));
  });
});
