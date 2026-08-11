import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useLabelOverrides } from "./use-label-overrides";

const STORAGE_KEY = "wayframe:label-overrides";

describe("useLabelOverrides (wayframe#47)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to no overrides when nothing is stored", async () => {
    const { result } = renderHook(() => useLabelOverrides());
    await waitFor(() => expect(result.current.overrides).toEqual({}));
  });

  it("rehydrates previously stored overrides", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ "title-m1": { dx: 5, dy: -10 } }));
    const { result } = renderHook(() => useLabelOverrides());
    await waitFor(() => expect(result.current.overrides).toEqual({ "title-m1": { dx: 5, dy: -10 } }));
  });

  it("accumulates a delta on top of an id's existing override, mirroring #51's endRefDrag", async () => {
    const { result } = renderHook(() => useLabelOverrides());
    await waitFor(() => expect(result.current.overrides).toEqual({}));

    act(() => result.current.addOverride("ghost-m2", { dx: 3, dy: 4 }));
    await waitFor(() => expect(result.current.overrides["ghost-m2"]).toEqual({ dx: 3, dy: 4 }));

    act(() => result.current.addOverride("ghost-m2", { dx: -1, dy: 2 }));
    await waitFor(() => expect(result.current.overrides["ghost-m2"]).toEqual({ dx: 2, dy: 6 }));
  });

  it("persists overrides to localStorage, keyed by element id", async () => {
    const { result } = renderHook(() => useLabelOverrides());
    await waitFor(() => expect(result.current.overrides).toEqual({}));

    act(() => result.current.addOverride("ref-ann1", { dx: 10, dy: 0 }));
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
      expect(saved).toEqual({ "ref-ann1": { dx: 10, dy: 0 } });
    });
  });

  it("falls back to no overrides for corrupt stored data", async () => {
    window.localStorage.setItem(STORAGE_KEY, "not json");
    const { result } = renderHook(() => useLabelOverrides());
    await waitFor(() => expect(result.current.overrides).toEqual({}));
  });

  it("drops a malformed entry from stored data rather than crashing", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ "title-m1": { dx: 5, dy: -10 }, "bad-id": "not an offset" }));
    const { result } = renderHook(() => useLabelOverrides());
    await waitFor(() => expect(result.current.overrides).toEqual({ "title-m1": { dx: 5, dy: -10 } }));
  });
});
