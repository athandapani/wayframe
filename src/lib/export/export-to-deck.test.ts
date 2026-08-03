import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportToDeck } from "./export-to-deck";

const addImage = vi.fn();
const addSlide = vi.fn(() => ({ addImage }));
const writeFile = vi.fn(() => Promise.resolve());
const defineLayout = vi.fn();

vi.mock("html2canvas-pro", () => ({
  default: vi.fn(() =>
    Promise.resolve({
      width: 1600,
      height: 800,
      toDataURL: () => "data:image/png;base64,fake",
    }),
  ),
}));

vi.mock("pptxgenjs", () => {
  class MockPres {
    layout = "";
    defineLayout = defineLayout;
    addSlide = addSlide;
    writeFile = writeFile;
  }
  return { default: MockPres };
});

describe("exportToDeck", () => {
  beforeEach(() => {
    addImage.mockClear();
    addSlide.mockClear();
    writeFile.mockClear();
  });

  it("adds one full-bleed image slide per source, in order", async () => {
    const program = document.createElement("div");
    const executive = document.createElement("div");

    await exportToDeck(
      [
        { label: "Program", element: program },
        { label: "Executive", element: executive },
      ],
      "test-deck.pptx",
    );

    expect(addSlide).toHaveBeenCalledTimes(2);
    expect(addImage).toHaveBeenCalledTimes(2);
    for (const call of addImage.mock.calls) {
      expect(call[0]).toMatchObject({ data: "data:image/png;base64,fake" });
    }
  });

  it("writes the file with the given file name", async () => {
    const element = document.createElement("div");
    await exportToDeck([{ label: "Program", element }], "atlas-deck.pptx");
    expect(writeFile).toHaveBeenCalledWith({ fileName: "atlas-deck.pptx" });
  });

  it("produces no slides for an empty source list", async () => {
    await exportToDeck([], "empty.pptx");
    expect(addSlide).not.toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalledWith({ fileName: "empty.pptx" });
  });
});
