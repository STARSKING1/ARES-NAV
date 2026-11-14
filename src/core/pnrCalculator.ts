import {
  EARTH_GRAVITY_MS2,
  MARS_GRAVITY_MS2,
  OXYGEN_DENSITY_KG_PER_LITRE_STP,
  OXYGEN_ENERGY_EQUIVALENT_J_PER_LITRE,
  PNR_CAUTION_FRACTION,
  PNR_CRITICAL_FRACTION,
  SANTEE_MIN_GRADE_PERCENT
} from "./constants";

export interface CrewProfile {
  readonly bodyMassKg: number;
  readonly loadMassKg: number;
  readonly walkingSpeedMs: number;
  readonly terrainFactor: number;
}

export interface RouteSegment {
  readonly distanceM: number;
  readonly gradePercent: number;
}

export interface PathPoint {
  readonly eastM: number;
  readonly northM: number;
  readonly elevationM: number;
}

export interface SuitReserves {
  readonly oxygenRemainingKg: number;
  readonly batteryRemainingWh: number;
  readonly batteryDrawWatts: number;
}

export type PnrStatus = "NOMINAL" | "CAUTION" | "CRITICAL_WALKBACK";

export interface PnrAssessment {
  readonly returnTimeS: number;
  readonly returnMetabolicEnergyJ: number;
  readonly returnOxygenKg: number;
  readonly returnBatteryWh: number;
  readonly oxygenDemandFraction: number;
  readonly batteryDemandFraction: number;
  readonly status: PnrStatus;
}

export const TERRAIN_FACTORS = {
  HARD_PACKED: 1.0,
  DIRT_ROAD: 1.1,
  LIGHT_BRUSH: 1.2,
  HEAVY_BRUSH: 1.5,
  SOFT_BOG: 1.8,
  LOOSE_SAND: 2.1
} as const;

export const DEFAULT_CREW_PROFILE: CrewProfile = {
  bodyMassKg: 80,
  loadMassKg: 130,
  walkingSpeedMs: 0.9,
  terrainFactor: TERRAIN_FACTORS.DIRT_ROAD
};

const assertFinite = (value: number, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number`);
  }
};

const assertPositive = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number`);
  }
};

const assertNonNegative = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative finite number`);
  }
};

const assertCrewProfile = (crew: CrewProfile): void => {
  assertPositive(crew.bodyMassKg, "bodyMassKg");
  assertNonNegative(crew.loadMassKg, "loadMassKg");
  assertPositive(crew.walkingSpeedMs, "walkingSpeedMs");
  assertPositive(crew.terrainFactor, "terrainFactor");
};

const standingMetabolicRateWatts = (bodyMassKg: number): number => 1.5 * bodyMassKg;

const pandolfWatts = (crew: CrewProfile, gradePercent: number): number => {
  const { bodyMassKg, loadMassKg, walkingSpeedMs, terrainFactor } = crew;
  const totalMassKg = bodyMassKg + loadMassKg;
  return (
    standingMetabolicRateWatts(bodyMassKg) +
    2 * totalMassKg * (loadMassKg / bodyMassKg) ** 2 +
    terrainFactor *
      totalMassKg *
      (1.5 * walkingSpeedMs ** 2 + 0.35 * walkingSpeedMs * gradePercent)
  );
};

const santeeDownhillCorrectionWatts = (crew: CrewProfile, gradePercent: number): number => {
  const { bodyMassKg, loadMassKg, walkingSpeedMs, terrainFactor } = crew;
  const totalMassKg = bodyMassKg + loadMassKg;
  return (
    terrainFactor *
    ((gradePercent * totalMassKg * walkingSpeedMs) / 3.5 -
      (totalMassKg * (gradePercent + 6) ** 2) / bodyMassKg +
      (25 - walkingSpeedMs ** 2))
  );
};

const earthEquivalentWatts = (crew: CrewProfile, gradePercent: number): number => {
  if (gradePercent >= 0) {
    return pandolfWatts(crew, gradePercent);
  }
  const boundedGrade = Math.max(gradePercent, SANTEE_MIN_GRADE_PERCENT);
  return pandolfWatts(crew, boundedGrade) - santeeDownhillCorrectionWatts(crew, boundedGrade);
};

export const metabolicRateWatts = (
  crew: CrewProfile,
  gradePercent: number,
  gravityMs2: number = MARS_GRAVITY_MS2
): number => {
  assertCrewProfile(crew);
  assertFinite(gradePercent, "gradePercent");
  assertPositive(gravityMs2, "gravityMs2");
  const standing = standingMetabolicRateWatts(crew.bodyMassKg);
  const gravityRatio = gravityMs2 / EARTH_GRAVITY_MS2;
  const scaled = standing + gravityRatio * (earthEquivalentWatts(crew, gradePercent) - standing);
  return Math.max(scaled, standing);
};

export const segmentGradePercent = (riseM: number, runM: number): number => {
  assertFinite(riseM, "riseM");
  assertPositive(runM, "runM");
  return (riseM / runM) * 100;
};

export const routeSegmentsFromPath = (points: ReadonlyArray<PathPoint>): ReadonlyArray<RouteSegment> => {
  const segments: RouteSegment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    const distanceM = Math.hypot(current.eastM - previous.eastM, current.northM - previous.northM);
    if (distanceM === 0) {
      continue;
    }
    segments.push({
      distanceM,
      gradePercent: segmentGradePercent(current.elevationM - previous.elevationM, distanceM)
    });
  }
  return segments;
};

const joulesToOxygenKg = (joules: number): number =>
  (joules / OXYGEN_ENERGY_EQUIVALENT_J_PER_LITRE) * OXYGEN_DENSITY_KG_PER_LITRE_STP;

const demandFraction = (demand: number, reserve: number): number => {
  if (reserve <= 0) {
    return demand > 0 ? Number.POSITIVE_INFINITY : 0;
  }
  return demand / reserve;
};

export const classifyPnrStatus = (oxygenFraction: number, batteryFraction: number): PnrStatus => {
  const governingFraction = Math.max(oxygenFraction, batteryFraction);
  if (governingFraction > PNR_CRITICAL_FRACTION) {
    return "CRITICAL_WALKBACK";
  }
  if (governingFraction > PNR_CAUTION_FRACTION) {
    return "CAUTION";
  }
  return "NOMINAL";
};

export const assessReturnPath = (
  segments: ReadonlyArray<RouteSegment>,
  crew: CrewProfile,
  reserves: SuitReserves,
  gravityMs2: number = MARS_GRAVITY_MS2
): PnrAssessment => {
  assertCrewProfile(crew);
  assertNonNegative(reserves.oxygenRemainingKg, "oxygenRemainingKg");
  assertNonNegative(reserves.batteryRemainingWh, "batteryRemainingWh");
  assertNonNegative(reserves.batteryDrawWatts, "batteryDrawWatts");

  let returnTimeS = 0;
  let returnMetabolicEnergyJ = 0;
  for (const segment of segments) {
    assertNonNegative(segment.distanceM, "distanceM");
    const durationS = segment.distanceM / crew.walkingSpeedMs;
    returnTimeS += durationS;
    returnMetabolicEnergyJ += metabolicRateWatts(crew, segment.gradePercent, gravityMs2) * durationS;
  }

  const returnOxygenKg = joulesToOxygenKg(returnMetabolicEnergyJ);
  const returnBatteryWh = (reserves.batteryDrawWatts * returnTimeS) / 3600;
  const oxygenDemandFraction = demandFraction(returnOxygenKg, reserves.oxygenRemainingKg);
  const batteryDemandFraction = demandFraction(returnBatteryWh, reserves.batteryRemainingWh);

  return {
    returnTimeS,
    returnMetabolicEnergyJ,
    returnOxygenKg,
    returnBatteryWh,
    oxygenDemandFraction,
    batteryDemandFraction,
    status: classifyPnrStatus(oxygenDemandFraction, batteryDemandFraction)
  };
};
