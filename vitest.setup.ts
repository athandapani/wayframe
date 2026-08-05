import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver, and RoadmapTimeline uses one to measure its
// container so the chart fills the available width. Under test there is no
// layout to observe (clientWidth is always 0), so the component falls back
// to its minimum width — a stub is enough to let it mount.
if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
