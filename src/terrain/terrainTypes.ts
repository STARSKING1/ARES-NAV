export const MINERAL_CLASS = {
  BASALTIC_BEDROCK: 0,
  PHYLLOSILICATE_CLAY: 1,
  HYDRATED_SULFATE: 2,
  AEOLIAN_DUST: 3
} as const;

export type MineralClass = (typeof MINERAL_CLASS)[keyof typeof MINERAL_CLASS];

export const MINERAL_CLASS_COUNT = 4;

export const THERMAL_INERTIA_TIU: Readonly<Record<MineralClass, number>> = {
  0: 400,
  1: 220,
  2: 280,
  3: 100
};

export const LOW_THERMAL_INERTIA_TIU = 150;

export type TerrainProvenance = "SYNTHETIC_GALE_CALIBRATED" | "HIRISE_DTM";

export interface GridCell {
  readonly column: number;
  readonly row: number;
}

export interface TerrainGrid {
  readonly provenance: TerrainProvenance;
  readonly width: number;
  readonly height: number;
  readonly cellSizeM: number;
  readonly elevationM: Float32Array;
  readonly mineralClass: Uint8Array;
}

export interface DerivedTerrain {
  readonly slopeDeg: Float32Array;
  readonly skyViewFactor: Float32Array;
  readonly thermalInertiaTiu: Float32Array;
}

export const cellIndex = (width: number, cell: GridCell): number => cell.row * width + cell.column;
