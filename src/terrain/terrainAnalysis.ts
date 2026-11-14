import {
  MINERAL_CLASS,
  THERMAL_INERTIA_TIU,
  type DerivedTerrain,
  type MineralClass,
  type TerrainGrid
} from "./terrainTypes";

const AZIMUTH_COUNT = 16;

const azimuthDirections = Array.from({ length: AZIMUTH_COUNT }, (_, index) => {
  const azimuthRad = (index * 2 * Math.PI) / AZIMUTH_COUNT;
  return { columnStep: Math.cos(azimuthRad), rowStep: Math.sin(azimuthRad) };
});

const RADIANS_TO_DEGREES = 180 / Math.PI;

export const computeSlopeDeg = (grid: TerrainGrid): Float32Array => {
  const { width, height, cellSizeM, elevationM } = grid;
  const slopeDeg = new Float32Array(width * height);
  for (let row = 0; row < height; row += 1) {
    const rowBefore = row > 0 ? row - 1 : row;
    const rowAfter = row < height - 1 ? row + 1 : row;
    for (let column = 0; column < width; column += 1) {
      const columnBefore = column > 0 ? column - 1 : column;
      const columnAfter = column < width - 1 ? column + 1 : column;
      const eastRise = (elevationM[row * width + columnAfter] ?? 0) - (elevationM[row * width + columnBefore] ?? 0);
      const southRise = (elevationM[rowAfter * width + column] ?? 0) - (elevationM[rowBefore * width + column] ?? 0);
      const gradientX = eastRise / ((columnAfter - columnBefore) * cellSizeM);
      const gradientY = southRise / ((rowAfter - rowBefore) * cellSizeM);
      slopeDeg[row * width + column] = Math.atan(Math.hypot(gradientX, gradientY)) * RADIANS_TO_DEGREES;
    }
  }
  return slopeDeg;
};

export const computeSkyViewFactor = (grid: TerrainGrid, maxDistanceM: number = 250): Float32Array => {
  const { width, height, cellSizeM, elevationM } = grid;
  const maxSteps = Math.max(1, Math.floor(maxDistanceM / cellSizeM));
  const skyViewFactor = new Float32Array(width * height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const baseElevation = elevationM[row * width + column] ?? 0;
      let occlusion = 0;
      for (const { columnStep, rowStep } of azimuthDirections) {
        let maxTangent = 0;
        for (let step = 1; step <= maxSteps; step += 1) {
          const sampleColumn = Math.round(column + columnStep * step);
          const sampleRow = Math.round(row + rowStep * step);
          if (sampleColumn < 0 || sampleColumn >= width || sampleRow < 0 || sampleRow >= height) {
            break;
          }
          const sampleElevation = elevationM[sampleRow * width + sampleColumn] ?? baseElevation;
          const tangent = (sampleElevation - baseElevation) / (step * cellSizeM);
          if (tangent > maxTangent) {
            maxTangent = tangent;
          }
        }
        occlusion += maxTangent / Math.sqrt(1 + maxTangent * maxTangent);
      }
      skyViewFactor[row * width + column] = 1 - occlusion / AZIMUTH_COUNT;
    }
  }
  return skyViewFactor;
};

const isMineralClass = (value: number): value is MineralClass =>
  value === MINERAL_CLASS.BASALTIC_BEDROCK ||
  value === MINERAL_CLASS.PHYLLOSILICATE_CLAY ||
  value === MINERAL_CLASS.HYDRATED_SULFATE ||
  value === MINERAL_CLASS.AEOLIAN_DUST;

export const computeThermalInertia = (mineralClass: Uint8Array): Float32Array => {
  const thermalInertiaTiu = new Float32Array(mineralClass.length);
  for (let index = 0; index < mineralClass.length; index += 1) {
    const value = mineralClass[index] ?? 0;
    if (!isMineralClass(value)) {
      throw new RangeError(`Unknown mineral class ${value} at cell ${index}`);
    }
    thermalInertiaTiu[index] = THERMAL_INERTIA_TIU[value];
  }
  return thermalInertiaTiu;
};

export const deriveTerrain = (grid: TerrainGrid, maxDistanceM: number = 250): DerivedTerrain => ({
  slopeDeg: computeSlopeDeg(grid),
  skyViewFactor: computeSkyViewFactor(grid, maxDistanceM),
  thermalInertiaTiu: computeThermalInertia(grid.mineralClass)
});
