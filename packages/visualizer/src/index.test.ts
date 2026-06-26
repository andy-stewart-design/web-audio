import { describe, expect, it } from "vitest";
import Visualizer, { Visualizer as NamedVisualizer } from "./index";

describe("Visualizer exports", () => {
  it("exports the visualizer class as default and named export", () => {
    expect(Visualizer).toBe(NamedVisualizer);
  });
});
