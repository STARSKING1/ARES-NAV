import { describe, expect, it } from "vitest";
import { generateGaleSector } from "../terrain/galeSectorGenerator";
import { deriveTerrain } from "../terrain/terrainAnalysis";
import { computeRadioViewshed } from "./viewshed";
import {
  findRoute,
  findNearestShelter,
  HARD_KINEMATIC_LIMITS
} from "./pathfinder";

describe("ARES-NAV Pathfinding Engine", () => {
  const grid = generateGaleSector({ width: 100, height: 100, cellSizeM: 10 });
  const derived = deriveTerrain(grid, 250);
  const antennaCell = { column: 15, row: 15 };
  const viewshed = computeRadioViewshed(grid, antennaCell);

  it("finds a valid nominal route across traversable terrain", () => {
    const start = { column: 15, row: 15 };
    const target = { column: 45, row: 45 };
    const result = findRoute(grid, derived, viewshed, start, target, "BALANCED");

    expect(result.success).toBe(true);
    expect(result.nodes.length).toBeGreaterThan(10);
    expect(result.totalDistanceM).toBeGreaterThan(300);
    expect(result.computeTimeMs).toBeGreaterThanOrEqual(0);

    const first = result.nodes[0]!;
    expect(first.column).toBe(start.column);
    expect(first.row).toBe(start.row);

    const last = result.nodes[result.nodes.length - 1]!;
    expect(last.column).toBe(target.column);
    expect(last.row).toBe(target.row);
  });

  it("enforces hard kinematic limits across every path node", () => {
    const start = { column: 15, row: 15 };
    const target = { column: 60, row: 50 };
    const result = findRoute(grid, derived, viewshed, start, target, "MAX_SCIENCE");

    expect(result.success).toBe(true);
    for (const node of result.nodes) {
      expect(node.slopeDeg).toBeLessThanOrEqual(HARD_KINEMATIC_LIMITS.maxSlopeBedrockDeg);
      if (node.thermalInertiaTiu < HARD_KINEMATIC_LIMITS.dustThermalInertiaThresholdTiu) {
        expect(node.slopeDeg).toBeLessThanOrEqual(HARD_KINEMATIC_LIMITS.maxSlopeDustDeg);
      }
    }
  });

  it("handles out-of-bounds coordinates safely", () => {
    const start = { column: -5, row: 15 };
    const target = { column: 45, row: 120 };
    const result = findRoute(grid, derived, viewshed, start, target, "BALANCED");

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("COORDINATES_OUT_OF_BOUNDS");
  });

  it("safely rejects destinations exceeding suit kinematic limits", () => {
    let impassableCell = { column: 0, row: 0 };
    for (let r = 0; r < grid.height; r += 1) {
      for (let c = 0; c < grid.width; c += 1) {
        const idx = r * grid.width + c;
        if ((derived.slopeDeg[idx] ?? 0) > 23.0) {
          impassableCell = { column: c, row: r };
          break;
        }
      }
    }

    const start = { column: 15, row: 15 };
    const result = findRoute(grid, derived, viewshed, start, impassableCell, "BALANCED");
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("DESTINATION_EXCEEDS_SUIT_KINEMATICS");
  });

  it("computes a SEP emergency shelter reroute", () => {
    const current = { column: 40, row: 40 };
    const result = findNearestShelter(grid, derived, viewshed, current);

    expect(result.success).toBe(true);
    expect(result.computeTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.nodes.length).toBeGreaterThan(0);
  });
});
