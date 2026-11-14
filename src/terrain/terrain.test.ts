import { describe, expect, it } from "vitest";
import { SpatialStore, createMemoryBackend, digestChunk } from "../core/spatialStore";
import { generateGaleSector } from "./galeSectorGenerator";
import { computeSkyViewFactor, computeSlopeDeg, deriveTerrain } from "./terrainAnalysis";
import {
  GALE_SECTOR_QUADKEY,
  chunkToTerrain,
  geographicQuadkey,
  terrainToChunk
} from "./terrainChunk";
import {
  LOW_THERMAL_INERTIA_TIU,
  MINERAL_CLASS,
  MINERAL_CLASS_COUNT,
  type TerrainGrid
} from "./terrainTypes";

const GOLDEN_DIGEST_200 = "3c9e68e6c80997d017a18fdf7ea89193a98fad4d606d8133a0c161436c9abb1d";
const GOLDEN_DIGEST_64 = "a32e947269f71ab135c60748cbc9e0eb8a6cf30cb019b267a7f428394a2fd7fc";
const SLOPE_ABORT_DEG = 20;
const SCARP_UPHILL_THRESHOLD_M = 770;
const HABITAT_COLUMN = 40;
const HABITAT_ROW = 30;

const buildGrid = (
  width: number,
  height: number,
  cellSizeM: number,
  elevationAt: (column: number, row: number) => number
): TerrainGrid => {
  const elevationM = new Float32Array(width * height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      elevationM[row * width + column] = elevationAt(column, row);
    }
  }
  return {
    provenance: "SYNTHETIC_GALE_CALIBRATED",
    width,
    height,
    cellSizeM,
    elevationM,
    mineralClass: new Uint8Array(width * height)
  };
};

const countReachableBeyondScarp = (slopeDeg: Float32Array, width: number, height: number): number => {
  const visited = new Uint8Array(width * height);
  const start = HABITAT_ROW * width + HABITAT_COLUMN;
  const stack = [start];
  visited[start] = 1;
  let beyondScarp = 0;
  while (stack.length > 0) {
    const index = stack.pop() ?? start;
    const column = index % width;
    const row = (index - column) / width;
    if (0.6 * column * 5 + 0.8 * row * 5 > SCARP_UPHILL_THRESHOLD_M) {
      beyondScarp += 1;
    }
    for (const [columnStep, rowStep] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nextColumn = column + columnStep;
      const nextRow = row + rowStep;
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= width || nextRow >= height) {
        continue;
      }
      const next = nextRow * width + nextColumn;
      if (visited[next] === 0 && (slopeDeg[next] ?? 90) <= SLOPE_ABORT_DEG) {
        visited[next] = 1;
        stack.push(next);
      }
    }
  }
  return beyondScarp;
};

describe("terrain analysis", () => {
  it("measures a ten degree inclined plane as ten degrees including edge cells", () => {
    const rise = Math.tan((10 * Math.PI) / 180);
    const plane = buildGrid(20, 20, 5, (column) => column * 5 * rise);
    const slope = computeSlopeDeg(plane);
    expect(slope[5 * 20 + 5]).toBeCloseTo(10, 3);
    expect(slope[5 * 20]).toBeCloseTo(10, 3);
    expect(slope[5 * 20 + 19]).toBeCloseTo(10, 3);
  });

  it("measures flat ground as zero slope", () => {
    const slope = computeSlopeDeg(buildGrid(10, 10, 5, () => -4482));
    expect(slope[55]).toBe(0);
  });

  it("gives open ground a sky-view factor of one", () => {
    const open = computeSkyViewFactor(buildGrid(21, 21, 5, () => 0));
    expect(open[0]).toBeCloseTo(1, 6);
    expect(open[10 * 21 + 10]).toBeCloseTo(1, 6);
  });

  it("shields the floor of a pit from most of the sky", () => {
    const pit = buildGrid(41, 41, 5, (column, row) =>
      Math.abs(column - 20) <= 1 && Math.abs(row - 20) <= 1 ? -10 : 0
    );
    const skyView = computeSkyViewFactor(pit);
    expect(skyView[20 * 41 + 20]).toBeLessThan(0.5);
    expect(skyView[0]).toBeCloseTo(1, 6);
  });
});

describe("Gale Crater synthetic sector", () => {
  const sector = generateGaleSector();
  const derived = deriveTerrain(sector);
  const cellCount = sector.width * sector.height;

  it("is a 200 by 200 grid at 5 m labelled as synthetic", () => {
    expect(sector.width).toBe(200);
    expect(sector.height).toBe(200);
    expect(sector.cellSizeM).toBe(5);
    expect(sector.provenance).toBe("SYNTHETIC_GALE_CALIBRATED");
  });

  it("places the habitat at the Gale datum elevation", () => {
    expect(sector.elevationM[HABITAT_ROW * 200 + HABITAT_COLUMN]).toBe(-4482);
  });

  it("has realistic relief across the one kilometre sector", () => {
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (const elevation of sector.elevationM) {
      low = Math.min(low, elevation);
      high = Math.max(high, elevation);
    }
    expect(high - low).toBeGreaterThan(50);
    expect(high - low).toBeLessThan(200);
  });

  it("contains slope-abort terrain while most of the sector stays walkable", () => {
    let steep = 0;
    let gentle = 0;
    for (const slope of derived.slopeDeg) {
      if (slope > SLOPE_ABORT_DEG) steep += 1;
      if (slope < 6) gentle += 1;
    }
    expect(steep / cellCount).toBeGreaterThan(0.01);
    expect(steep / cellCount).toBeLessThan(0.1);
    expect(gentle / cellCount).toBeGreaterThan(0.6);
  });

  it("contains every mineral class", () => {
    const counts = new Array<number>(MINERAL_CLASS_COUNT).fill(0);
    for (const mineral of sector.mineralClass) {
      counts[mineral] = (counts[mineral] ?? 0) + 1;
    }
    for (const count of counts) {
      expect(count).toBeGreaterThan(0);
    }
  });

  it("assigns low thermal inertia exclusively to aeolian dust", () => {
    for (let index = 0; index < cellCount; index += 1) {
      const isLowInertia = (derived.thermalInertiaTiu[index] ?? 0) < LOW_THERMAL_INERTIA_TIU;
      expect(isLowInertia).toBe(sector.mineralClass[index] === MINERAL_CLASS.AEOLIAN_DUST);
    }
  });

  it("keeps sky-view factors within zero to one", () => {
    for (const value of derived.skyViewFactor) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(1.000001);
    }
  });

  it("leaves a walkable pass from the habitat to the terrain beyond the scarp", () => {
    expect(countReachableBeyondScarp(derived.slopeDeg, sector.width, sector.height)).toBeGreaterThan(1000);
  });

  it("regenerates bit-for-bit identical terrain", async () => {
    expect(await digestChunk(terrainToChunk(GALE_SECTOR_QUADKEY, sector))).toBe(GOLDEN_DIGEST_200);
    expect(
      await digestChunk(terrainToChunk(GALE_SECTOR_QUADKEY, generateGaleSector({ width: 64, height: 64 })))
    ).toBe(GOLDEN_DIGEST_64);
  });
});

describe("terrain chunks and integrity", () => {
  it("indexes Gale Crater by a twelve level geographic quadkey", () => {
    expect(GALE_SECTOR_QUADKEY).toBe("311002213013");
    expect(() => geographicQuadkey(91, 0, 12)).toThrow();
  });

  it("round-trips a sector through a chunk without changing a value", () => {
    const sector = generateGaleSector({ width: 32, height: 32 });
    const restored = chunkToTerrain(terrainToChunk(GALE_SECTOR_QUADKEY, sector), 5, "SYNTHETIC_GALE_CALIBRATED");
    expect(restored.elevationM).toEqual(sector.elevationM);
    expect(restored.mineralClass).toEqual(sector.mineralClass);
  });

  it("rejects a chunk carrying an unknown mineral class", () => {
    const chunk = terrainToChunk(GALE_SECTOR_QUADKEY, generateGaleSector({ width: 16, height: 16 }));
    const corrupted = new Uint8Array(chunk.hazardClass);
    corrupted[7] = 9;
    expect(() => chunkToTerrain({ ...chunk, hazardClass: corrupted }, 5, "SYNTHETIC_GALE_CALIBRATED")).toThrow();
  });

  it("detects an upset in the sector and restores it by regenerating pristine terrain", async () => {
    const sector = generateGaleSector();
    const store = new SpatialStore({
      backend: createMemoryBackend(),
      pristineSource: async () => terrainToChunk(GALE_SECTOR_QUADKEY, generateGaleSector())
    });
    const original = await store.ingest(terrainToChunk(GALE_SECTOR_QUADKEY, sector));
    expect(await store.injectSingleEventUpset(GALE_SECTOR_QUADKEY, 123456)).toBe(true);
    const result = await store.load(GALE_SECTOR_QUADKEY);
    expect(result.status).toBe("RECOVERED");
    expect(result.chunk?.digestHex).toBe(original.digestHex);
    expect(result.chunk?.elevationM).toEqual(sector.elevationM);
    expect(await store.quarantinedQuadkeys()).toEqual([GALE_SECTOR_QUADKEY]);
  });
});
