import { describe, expect, it } from "vitest";
import { generateGaleSector } from "../terrain/galeSectorGenerator";
import { computeRadioViewshed } from "./viewshed";

describe("Radio Line-of-Sight Viewshed", () => {
  const grid = generateGaleSector({ width: 100, height: 100, cellSizeM: 10 });
  const antennaCell = { column: 10, row: 10 };

  it("marks antenna cell as visible", () => {
    const viewshed = computeRadioViewshed(grid, antennaCell);
    const index = antennaCell.row * grid.width + antennaCell.column;
    expect(viewshed[index]).toBe(1);
  });

  it("produces valid binary visibility values", () => {
    const viewshed = computeRadioViewshed(grid, antennaCell);
    expect(viewshed.length).toBe(grid.width * grid.height);
    for (let i = 0; i < viewshed.length; i += 1) {
      expect(viewshed[i] === 0 || viewshed[i] === 1).toBe(true);
    }
  });

  it("achieves realistic Gale Crater LoS coverage with terrain occlusion", () => {
    const viewshed = computeRadioViewshed(grid, antennaCell);
    let visibleCount = 0;
    for (let i = 0; i < viewshed.length; i += 1) {
      if (viewshed[i] === 1) visibleCount += 1;
    }
    const coverage = visibleCount / viewshed.length;
    expect(coverage).toBeGreaterThan(0.3);
    expect(coverage).toBeLessThan(0.95);
  });
});
