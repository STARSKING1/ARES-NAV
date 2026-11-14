import {
  MARS_GRAVITY_MS2,
  OXYGEN_DENSITY_KG_PER_LITRE_STP,
  OXYGEN_ENERGY_EQUIVALENT_J_PER_LITRE
} from "../core/constants";
import { DEFAULT_CREW_PROFILE, metabolicRateWatts, routeSegmentsFromPath, assessReturnPath, type RouteSegment } from "../core/pnrCalculator";
import type { PathNode } from "./pathfinder";

export interface MissionMetrics {
  readonly walkingDurationHours: number;
  readonly oxygenUsedKg: number;
  readonly remainingOxygenKg: number;
  readonly remainingOxygenFraction: number;
  readonly batteryUsedWh: number;
  readonly remainingBatteryWh: number;
  readonly meanMetabolicWatts: number;
  readonly radiationDoseMSv: number;
  readonly maximumSlopeDeg: number;
  readonly pnrStatus: "NOMINAL" | "CAUTION" | "CRITICAL_WALKBACK";
  readonly returnOxygenDemandFraction: number;
}

export interface MissionResourceProfile {
  readonly oxygenCapacityKg: number;
  readonly batteryCapacityWh: number;
  readonly batteryLoadWatts: number;
  readonly radiationRateMSvPerDay: number;
  readonly sepMultiplier: number;
}

export const DEFAULT_MISSION_RESOURCES: MissionResourceProfile = {
  oxygenCapacityKg: 2.0,
  batteryCapacityWh: 900,
  batteryLoadWatts: 45,
  radiationRateMSvPerDay: 0.64,
  sepMultiplier: 1
};

const joulesToOxygenKg = (energyJ: number): number =>
  (energyJ / OXYGEN_ENERGY_EQUIVALENT_J_PER_LITRE) * OXYGEN_DENSITY_KG_PER_LITRE_STP;

export const calculateMissionMetrics = (
  nodes: ReadonlyArray<PathNode>,
  resources: MissionResourceProfile = DEFAULT_MISSION_RESOURCES
): MissionMetrics => {
  if (nodes.length < 2) {
    return {
      walkingDurationHours: 0,
      oxygenUsedKg: 0,
      remainingOxygenKg: resources.oxygenCapacityKg,
      remainingOxygenFraction: 1,
      batteryUsedWh: 0,
      remainingBatteryWh: resources.batteryCapacityWh,
      meanMetabolicWatts: 0,
      radiationDoseMSv: 0,
      maximumSlopeDeg: 0,
      pnrStatus: "NOMINAL",
      returnOxygenDemandFraction: 0
    };
  }

  let totalDurationS = 0;
  let totalEnergyJ = 0;
  let totalRadiationDoseMSv = 0;
  let maximumSlopeDeg = 0;

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    if (node.slopeDeg > maximumSlopeDeg) maximumSlopeDeg = node.slopeDeg;

    if (index === 0) continue;
    const previousNode = nodes[index - 1]!;
    const segmentDistanceM = Math.hypot(
      node.eastM - previousNode.eastM,
      node.northM - previousNode.northM
    );
    const durationS = segmentDistanceM / DEFAULT_CREW_PROFILE.walkingSpeedMs;
    const elevationChangeM = node.elevationM - previousNode.elevationM;
    const gradePercent = segmentDistanceM > 0 ? (elevationChangeM / segmentDistanceM) * 100 : 0;
    const metabolicWatts = metabolicRateWatts(DEFAULT_CREW_PROFILE, gradePercent, MARS_GRAVITY_MS2);
    totalDurationS += durationS;
    totalEnergyJ += metabolicWatts * durationS;
    totalRadiationDoseMSv +=
      (resources.radiationRateMSvPerDay / 24 / 3600) *
      resources.sepMultiplier *
      node.skyViewFactor *
      durationS;
  }

  const oxygenUsedKg = joulesToOxygenKg(totalEnergyJ);
  const batteryUsedWh = (resources.batteryLoadWatts * totalDurationS) / 3600;
  const remainingOxygenKg = Math.max(0, resources.oxygenCapacityKg - oxygenUsedKg);
  const remainingBatteryWh = Math.max(0, resources.batteryCapacityWh - batteryUsedWh);
  const reversedPath = [...nodes].reverse().map((node) => ({ eastM: node.eastM, northM: node.northM, elevationM: node.elevationM }));
  const returnAssessment = assessReturnPath(
    routeSegmentsFromPath(reversedPath),
    DEFAULT_CREW_PROFILE,
    {
      oxygenRemainingKg: remainingOxygenKg,
      batteryRemainingWh: remainingBatteryWh,
      batteryDrawWatts: resources.batteryLoadWatts
    },
    MARS_GRAVITY_MS2
  );

  return {
    walkingDurationHours: totalDurationS / 3600,
    oxygenUsedKg,
    remainingOxygenKg,
    remainingOxygenFraction: resources.oxygenCapacityKg > 0 ? remainingOxygenKg / resources.oxygenCapacityKg : 0,
    batteryUsedWh,
    remainingBatteryWh,
    meanMetabolicWatts: totalDurationS > 0 ? totalEnergyJ / totalDurationS : 0,
    radiationDoseMSv: totalRadiationDoseMSv,
    maximumSlopeDeg,
    pnrStatus: returnAssessment.status,
    returnOxygenDemandFraction: returnAssessment.oxygenDemandFraction
  };
};

export const routeSegmentsFromNodes = (nodes: ReadonlyArray<PathNode>): ReadonlyArray<RouteSegment> => {
  const segments: RouteSegment[] = [];
  for (let index = 1; index < nodes.length; index += 1) {
    const previous = nodes[index - 1];
    const current = nodes[index];
    if (!previous || !current) continue;
    const distanceM = Math.hypot(current.eastM - previous.eastM, current.northM - previous.northM);
    const gradePercent = distanceM > 0 ? ((current.elevationM - previous.elevationM) / distanceM) * 100 : 0;
    segments.push({ distanceM, gradePercent });
  }
  return segments;
};
