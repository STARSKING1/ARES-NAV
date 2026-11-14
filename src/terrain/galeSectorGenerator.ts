import { GALE_SITE } from "../core/constants";
import { computeSlopeDeg } from "./terrainAnalysis";
import { MINERAL_CLASS, type GridCell, type TerrainGrid } from "./terrainTypes";

export interface GaleSectorOptions {
  readonly width?: number;
  readonly height?: number;
  readonly cellSizeM?: number;
  readonly habitatCell?: GridCell;
}

const SECTOR_SEED = 0x41524553;
const ROTATION_COSINE = 0.9396926;
const ROTATION_SINE = 0.3420201;
const REGIONAL_RISE_PER_METER = 0.06;
const UNDULATION_AMPLITUDE_M = 8;
const UNDULATION_WAVELENGTH_M = 250;
const ROUGHNESS_AMPLITUDE_M = 0.3;
const ROUGHNESS_WAVELENGTH_M = 12;
const RIDGE_HEIGHT_M = 1.2;
const RIDGE_HALF_WIDTH_M = 6;
const RIDGE_SPACING_U_M = 55;
const RIDGE_SPACING_V_M = 70;
const RIDGE_PRESENCE_WAVELENGTH_M = 160;
const SCARP_CENTER_M = 700;
const SCARP_HALF_WIDTH_M = 35;
const SCARP_MAX_HEIGHT_M = 20;
const SCARP_MIN_HEIGHT_FRACTION = 0.15;
const SCARP_WAVELENGTH_M = 180;
const DUST_MAX_SLOPE_DEG = 5;
const DUST_MIN_CONCAVITY_M = 0.1;
const DUST_NOISE_THRESHOLD = 0.45;
const CLAY_NOISE_THRESHOLD = 0.62;
const SULFATE_RIDGE_THRESHOLD = 0.35;
const CONCAVITY_RADIUS_CELLS = 3;

const hashLattice = (latticeX: number, latticeY: number, seed: number): number => {
  let hash = Math.imul(latticeX, 0x27d4eb2d) ^ Math.imul(latticeY, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
};

const smoothstep = (edgeLow: number, edgeHigh: number, value: number): number => {
  const fraction = Math.min(1, Math.max(0, (value - edgeLow) / (edgeHigh - edgeLow)));
  return fraction * fraction * (3 - 2 * fraction);
};

const valueNoise = (x: number, y: number, seed: number): number => {
  const latticeX = Math.floor(x);
  const latticeY = Math.floor(y);
  const blendX = smoothstep(0, 1, x - latticeX);
  const blendY = smoothstep(0, 1, y - latticeY);
  const topLeft = hashLattice(latticeX, latticeY, seed);
  const topRight = hashLattice(latticeX + 1, latticeY, seed);
  const bottomLeft = hashLattice(latticeX, latticeY + 1, seed);
  const bottomRight = hashLattice(latticeX + 1, latticeY + 1, seed);
  const top = topLeft + (topRight - topLeft) * blendX;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * blendX;
  return top + (bottom - top) * blendY;
};

const fractalNoise = (x: number, y: number, seed: number, octaves: number): number => {
  let sum = 0;
  let amplitude = 1;
  let totalAmplitude = 0;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += amplitude * valueNoise(x * frequency, y * frequency, seed + octave);
    totalAmplitude += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / totalAmplitude;
};

const ridgeProfile = (coordinateM: number, spacingM: number): number => {
  const scaled = coordinateM / spacingM;
  const fractional = scaled - Math.floor(scaled);
  const distanceM = Math.min(fractional, 1 - fractional) * spacingM;
  const remaining = 1 - distanceM / RIDGE_HALF_WIDTH_M;
  return remaining > 0 ? remaining * remaining * (3 - 2 * remaining) : 0;
};

const localMeanElevation = (
  elevationM: Float64Array,
  width: number,
  height: number,
  column: number,
  row: number
): number => {
  let sum = 0;
  let count = 0;
  for (let rowOffset = -CONCAVITY_RADIUS_CELLS; rowOffset <= CONCAVITY_RADIUS_CELLS; rowOffset += 1) {
    for (let columnOffset = -CONCAVITY_RADIUS_CELLS; columnOffset <= CONCAVITY_RADIUS_CELLS; columnOffset += 1) {
      const sampleColumn = column + columnOffset;
      const sampleRow = row + rowOffset;
      if (sampleColumn >= 0 && sampleColumn < width && sampleRow >= 0 && sampleRow < height) {
        sum += elevationM[sampleRow * width + sampleColumn] ?? 0;
        count += 1;
      }
    }
  }
  return sum / count;
};

export const generateGaleSector = (options: GaleSectorOptions = {}): TerrainGrid => {
  const width = options.width ?? 200;
  const height = options.height ?? 200;
  const cellSizeM = options.cellSizeM ?? 5;
  const habitatCell = options.habitatCell ?? {
    column: Math.floor(width * 0.2),
    row: Math.floor(height * 0.15)
  };

  const rawElevationM = new Float64Array(width * height);
  const ridgeStrength = new Float64Array(width * height);

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const eastM = column * cellSizeM;
      const southM = row * cellSizeM;
      const uphillM = 0.6 * eastM + 0.8 * southM;
      const alongScarpM = -0.8 * eastM + 0.6 * southM;
      const rotatedU = eastM * ROTATION_COSINE + southM * ROTATION_SINE;
      const rotatedV = -eastM * ROTATION_SINE + southM * ROTATION_COSINE;

      const ridgePresence = smoothstep(
        0.35,
        0.65,
        fractalNoise(eastM / RIDGE_PRESENCE_WAVELENGTH_M, southM / RIDGE_PRESENCE_WAVELENGTH_M, SECTOR_SEED + 11, 2)
      );
      const ridge =
        Math.max(ridgeProfile(rotatedU, RIDGE_SPACING_U_M), ridgeProfile(rotatedV, RIDGE_SPACING_V_M)) *
        ridgePresence;

      const scarpHeightFraction =
        SCARP_MIN_HEIGHT_FRACTION +
        (1 - SCARP_MIN_HEIGHT_FRACTION) *
          smoothstep(0.35, 0.65, valueNoise(alongScarpM / SCARP_WAVELENGTH_M, 0.5, SECTOR_SEED + 23));
      const scarp =
        SCARP_MAX_HEIGHT_M *
        scarpHeightFraction *
        smoothstep(SCARP_CENTER_M - SCARP_HALF_WIDTH_M, SCARP_CENTER_M + SCARP_HALF_WIDTH_M, uphillM);

      const undulation =
        UNDULATION_AMPLITUDE_M *
        fractalNoise(eastM / UNDULATION_WAVELENGTH_M, southM / UNDULATION_WAVELENGTH_M, SECTOR_SEED, 3);
      const roughness =
        ROUGHNESS_AMPLITUDE_M *
        valueNoise(eastM / ROUGHNESS_WAVELENGTH_M, southM / ROUGHNESS_WAVELENGTH_M, SECTOR_SEED + 5);

      const index = row * width + column;
      rawElevationM[index] =
        REGIONAL_RISE_PER_METER * uphillM + undulation + roughness + scarp + RIDGE_HEIGHT_M * ridge;
      ridgeStrength[index] = ridge;
    }
  }

  const habitatRaw = rawElevationM[habitatCell.row * width + habitatCell.column] ?? 0;
  const elevationM = new Float32Array(width * height);
  for (let index = 0; index < elevationM.length; index += 1) {
    elevationM[index] = (rawElevationM[index] ?? 0) - habitatRaw + GALE_SITE.datumElevationM;
  }

  const slopeDeg = computeSlopeDeg({
    provenance: "SYNTHETIC_GALE_CALIBRATED",
    width,
    height,
    cellSizeM,
    elevationM,
    mineralClass: new Uint8Array(width * height)
  });

  const mineralClass = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const index = row * width + column;
      const eastM = column * cellSizeM;
      const southM = row * cellSizeM;
      const concavityM = localMeanElevation(rawElevationM, width, height, column, row) - (rawElevationM[index] ?? 0);
      const dustNoise = fractalNoise(eastM / 90, southM / 90, SECTOR_SEED + 31, 2);
      const clayNoise = fractalNoise(eastM / 220, southM / 220, SECTOR_SEED + 47, 2);

      if ((ridgeStrength[index] ?? 0) > SULFATE_RIDGE_THRESHOLD) {
        mineralClass[index] = MINERAL_CLASS.HYDRATED_SULFATE;
      } else if (
        (slopeDeg[index] ?? 0) < DUST_MAX_SLOPE_DEG &&
        concavityM > DUST_MIN_CONCAVITY_M &&
        dustNoise > DUST_NOISE_THRESHOLD
      ) {
        mineralClass[index] = MINERAL_CLASS.AEOLIAN_DUST;
      } else if (clayNoise > CLAY_NOISE_THRESHOLD) {
        mineralClass[index] = MINERAL_CLASS.PHYLLOSILICATE_CLAY;
      } else {
        mineralClass[index] = MINERAL_CLASS.BASALTIC_BEDROCK;
      }
    }
  }

  return {
    provenance: "SYNTHETIC_GALE_CALIBRATED",
    width,
    height,
    cellSizeM,
    elevationM,
    mineralClass
  };
};
