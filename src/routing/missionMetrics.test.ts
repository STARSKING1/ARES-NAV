import { describe, expect, it } from "vitest";
import { generateGaleSector } from "../terrain/galeSectorGenerator";
import { deriveTerrain } from "../terrain/terrainAnalysis";
import { computeRadioViewshed } from "./viewshed";
import { findRoute } from "./pathfinder";
import { calculateMissionMetrics, DEFAULT_MISSION_RESOURCES } from "./missionMetrics";

describe("Mission resource metrics", () => {
  const grid = generateGaleSector({ width: 60, height: 60, cellSizeM: 10 });
  const derived = deriveTerrain(grid, 200);
  const viewshed = computeRadioViewshed(grid, { column: 10, row: 10 });
  const route = findRoute(
    grid,
    derived,
    viewshed,
    { column: 10, row: 10 },
    { column: 40, row: 40 },
    "BALANCED"
  );

  it("calculates nonnegative time, oxygen, battery, and radiation", () => {
    expect(route.success).toBe(true);
    const metrics = calculateMissionMetrics(route.nodes);
    expect(metrics.walkingDurationHours).toBeGreaterThan(0);
    expect(metrics.oxygenUsedKg).toBeGreaterThan(0);
    expect(metrics.batteryUsedWh).toBeGreaterThan(0);
    expect(metrics.radiationDoseMSv).toBeGreaterThan(0);
    expect(["NOMINAL", "CAUTION", "CRITICAL_WALKBACK"]).toContain(metrics.pnrStatus);
    expect(metrics.remainingOxygenKg).toBeLessThan(DEFAULT_MISSION_RESOURCES.oxygenCapacityKg);
    expect(metrics.remainingBatteryWh).toBeLessThan(DEFAULT_MISSION_RESOURCES.batteryCapacityWh);
  });

  it("scales dose by sky-view and SEP multiplier", () => {
    const nominal = calculateMissionMetrics(route.nodes, {
      ...DEFAULT_MISSION_RESOURCES,
      radiationRateMSvPerDay: 0.64,
      sepMultiplier: 1
    });
    const sep = calculateMissionMetrics(route.nodes, {
      ...DEFAULT_MISSION_RESOURCES,
      radiationRateMSvPerDay: 0.64,
      sepMultiplier: 10
    });
    expect(sep.radiationDoseMSv).toBeCloseTo(nominal.radiationDoseMSv * 10, 8);
  });

  it("returns full resources for an empty path", () => {
    const metrics = calculateMissionMetrics([]);
    expect(metrics.oxygenUsedKg).toBe(0);
    expect(metrics.remainingOxygenKg).toBe(DEFAULT_MISSION_RESOURCES.oxygenCapacityKg);
  });
});
