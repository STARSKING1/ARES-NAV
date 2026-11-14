import {
  MINERAL_CLASS,
  LOW_THERMAL_INERTIA_TIU,
  type GridCell,
  type TerrainGrid,
  type DerivedTerrain
} from "../terrain/terrainTypes";

export type RoutingMode = "BALANCED" | "MAX_SAFETY" | "MAX_SCIENCE" | "SEP_EMERGENCY";

export interface RoutingWeights {
  readonly slopeWeight: number;
  readonly dustWeight: number;
  readonly radiationWeight: number;
  readonly commsLossWeight: number;
  readonly scienceIncentive: number;
}

export const ROUTING_PRESETS: Readonly<Record<RoutingMode, RoutingWeights>> = {
  BALANCED: {
    slopeWeight: 1.0,
    dustWeight: 1.5,
    radiationWeight: 0.8,
    commsLossWeight: 0.5,
    scienceIncentive: 0.2
  },
  MAX_SAFETY: {
    slopeWeight: 2.5,
    dustWeight: 3.5,
    radiationWeight: 2.2,
    commsLossWeight: 1.2,
    scienceIncentive: 0.0
  },
  MAX_SCIENCE: {
    slopeWeight: 0.8,
    dustWeight: 1.2,
    radiationWeight: 0.5,
    commsLossWeight: 0.3,
    scienceIncentive: 1.5
  },
  SEP_EMERGENCY: {
    slopeWeight: 1.2,
    dustWeight: 2.0,
    radiationWeight: 8.0,
    commsLossWeight: 0.1,
    scienceIncentive: 0.0
  }
};

export const HARD_KINEMATIC_LIMITS = {
  maxSlopeBedrockDeg: 22.0,
  maxSlopeDustDeg: 15.0,
  dustThermalInertiaThresholdTiu: LOW_THERMAL_INERTIA_TIU
} as const;

export interface PathNode {
  readonly column: number;
  readonly row: number;
  readonly eastM: number;
  readonly northM: number;
  readonly elevationM: number;
  readonly slopeDeg: number;
  readonly skyViewFactor: number;
  readonly thermalInertiaTiu: number;
  readonly radioLoS: number;
  readonly mineralClass: number;
}

export interface PathResult {
  readonly success: boolean;
  readonly failureReason?: string;
  readonly nodes: ReadonlyArray<PathNode>;
  readonly totalDistanceM: number;
  readonly totalAscentM: number;
  readonly totalDescentM: number;
  readonly computeTimeMs: number;
}

class PriorityQueue {
  private items: Array<{ index: number; cost: number }> = [];

  push(index: number, cost: number): void {
    this.items.push({ index, cost });
    this.siftUp(this.items.length - 1);
  }

  pop(): number | undefined {
    if (this.items.length === 0) return undefined;
    const root = this.items[0];
    const leaf = this.items.pop();
    if (leaf !== undefined && this.items.length > 0) {
      this.items[0] = leaf;
      this.siftDown(0);
    }
    return root?.index;
  }

  get size(): number {
    return this.items.length;
  }

  private siftUp(index: number): void {
    let current = index;
    const element = this.items[current];
    if (element === undefined) return;
    while (current > 0) {
      const parentIndex = (current - 1) >> 1;
      const parent = this.items[parentIndex];
      if (parent === undefined || element.cost >= parent.cost) break;
      this.items[current] = parent;
      this.items[parentIndex] = element;
      current = parentIndex;
    }
  }

  private siftDown(index: number): void {
    let current = index;
    const length = this.items.length;
    const element = this.items[current];
    if (element === undefined) return;
    while (true) {
      const leftChildIndex = (current << 1) + 1;
      const rightChildIndex = leftChildIndex + 1;
      let targetIndex = current;
      let minCost = element.cost;

      if (leftChildIndex < length) {
        const leftChild = this.items[leftChildIndex];
        if (leftChild !== undefined && leftChild.cost < minCost) {
          targetIndex = leftChildIndex;
          minCost = leftChild.cost;
        }
      }

      if (rightChildIndex < length) {
        const rightChild = this.items[rightChildIndex];
        if (rightChild !== undefined && rightChild.cost < minCost) {
          targetIndex = rightChildIndex;
        }
      }

      if (targetIndex === current) break;
      const targetElement = this.items[targetIndex];
      if (targetElement === undefined) break;
      this.items[current] = targetElement;
      this.items[targetIndex] = element;
      current = targetIndex;
    }
  }
}

const isCellTraversable = (
  slope: number,
  thermalInertia: number
): boolean => {
  if (slope > HARD_KINEMATIC_LIMITS.maxSlopeBedrockDeg) {
    return false;
  }
  if (
    slope > HARD_KINEMATIC_LIMITS.maxSlopeDustDeg &&
    thermalInertia < HARD_KINEMATIC_LIMITS.dustThermalInertiaThresholdTiu
  ) {
    return false;
  }
  return true;
};

export const findRoute = (
  grid: TerrainGrid,
  derived: DerivedTerrain,
  radioViewshed: Uint8Array,
  start: GridCell,
  target: GridCell,
  mode: RoutingMode = "BALANCED"
): PathResult => {
  const startTime = performance.now();
  const { width, height, cellSizeM, elevationM, mineralClass } = grid;
  const { slopeDeg, skyViewFactor, thermalInertiaTiu } = derived;
  const totalCells = width * height;

  const startIndex = start.row * width + start.column;
  const targetIndex = target.row * width + target.column;

  if (
    start.column < 0 ||
    start.column >= width ||
    start.row < 0 ||
    start.row >= height ||
    target.column < 0 ||
    target.column >= width ||
    target.row < 0 ||
    target.row >= height
  ) {
    return {
      success: false,
      failureReason: "COORDINATES_OUT_OF_BOUNDS",
      nodes: [],
      totalDistanceM: 0,
      totalAscentM: 0,
      totalDescentM: 0,
      computeTimeMs: performance.now() - startTime
    };
  }

  const targetSlope = slopeDeg[targetIndex] ?? 0;
  const targetTI = thermalInertiaTiu[targetIndex] ?? 0;
  if (!isCellTraversable(targetSlope, targetTI)) {
    return {
      success: false,
      failureReason: "DESTINATION_EXCEEDS_SUIT_KINEMATICS",
      nodes: [],
      totalDistanceM: 0,
      totalAscentM: 0,
      totalDescentM: 0,
      computeTimeMs: performance.now() - startTime
    };
  }

  const weights = ROUTING_PRESETS[mode];
  const gScores = new Float32Array(totalCells).fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Int32Array(totalCells).fill(-1);
  const queue = new PriorityQueue();

  gScores[startIndex] = 0;
  const initialH = Math.hypot(target.column - start.column, target.row - start.row) * cellSizeM * 0.4;
  queue.push(startIndex, initialH);

  while (queue.size > 0) {
    const currentIndex = queue.pop();
    if (currentIndex === undefined) break;
    if (currentIndex === targetIndex) break;

    const currentCol = currentIndex % width;
    const currentRow = Math.floor(currentIndex / width);
    const currentElevation = elevationM[currentIndex] ?? 0;
    const currentG = gScores[currentIndex] ?? Number.POSITIVE_INFINITY;

    for (let deltaRow = -1; deltaRow <= 1; deltaRow += 1) {
      for (let deltaCol = -1; deltaCol <= 1; deltaCol += 1) {
        if (deltaRow === 0 && deltaCol === 0) continue;
        const neighborCol = currentCol + deltaCol;
        const neighborRow = currentRow + deltaRow;

        if (
          neighborCol < 0 ||
          neighborCol >= width ||
          neighborRow < 0 ||
          neighborRow >= height
        ) {
          continue;
        }

        const neighborIndex = neighborRow * width + neighborCol;
        const nSlope = slopeDeg[neighborIndex] ?? 0;
        const nTI = thermalInertiaTiu[neighborIndex] ?? 0;

        if (!isCellTraversable(nSlope, nTI)) {
          continue;
        }

        const isDiagonal = deltaCol !== 0 && deltaRow !== 0;
        const stepDistanceM = isDiagonal ? 1.41421356 * cellSizeM : cellSizeM;
        const nElevation = elevationM[neighborIndex] ?? 0;
        const deltaElev = nElevation - currentElevation;

        let slopePenalty = 1.0 + (nSlope / 15.0) * weights.slopeWeight * 2.0;
        if (deltaElev > 0) {
          slopePenalty += (deltaElev / stepDistanceM) * 3.0;
        }

        const dustPenalty =
          nTI < HARD_KINEMATIC_LIMITS.dustThermalInertiaThresholdTiu
            ? 1.0 + weights.dustWeight * 2.0
            : 1.0;

        const nSkyView = skyViewFactor[neighborIndex] ?? 1.0;
        const radiationPenalty = 1.0 + nSkyView * weights.radiationWeight;

        const nComms = radioViewshed[neighborIndex] ?? 1;
        const commsPenalty = nComms === 0 ? 1.0 + weights.commsLossWeight : 1.0;

        const nMineral = mineralClass[neighborIndex] ?? 0;
        let scienceBonus = 1.0;
        if (
          nMineral === MINERAL_CLASS.HYDRATED_SULFATE ||
          nMineral === MINERAL_CLASS.PHYLLOSILICATE_CLAY
        ) {
          scienceBonus = Math.max(0.4, 1.0 - weights.scienceIncentive * 0.35);
        }

        const segmentCost =
          stepDistanceM *
          slopePenalty *
          dustPenalty *
          radiationPenalty *
          commsPenalty *
          scienceBonus;

        const tentativeG = currentG + segmentCost;
        if (tentativeG < (gScores[neighborIndex] ?? Number.POSITIVE_INFINITY)) {
          gScores[neighborIndex] = tentativeG;
          cameFrom[neighborIndex] = currentIndex;
          const remainingH =
            Math.hypot(target.column - neighborCol, target.row - neighborRow) * cellSizeM * 0.4;
          queue.push(neighborIndex, tentativeG + remainingH);
        }
      }
    }
  }

  if (gScores[targetIndex] === Number.POSITIVE_INFINITY) {
    return {
      success: false,
      failureReason: "ROUTE_BLOCKED_BY_OBSTACLES",
      nodes: [],
      totalDistanceM: 0,
      totalAscentM: 0,
      totalDescentM: 0,
      computeTimeMs: performance.now() - startTime
    };
  }

  const pathIndices: number[] = [];
  let tracer = targetIndex;
  while (tracer !== -1) {
    pathIndices.push(tracer);
    tracer = cameFrom[tracer] ?? -1;
  }
  pathIndices.reverse();

  let totalDistM = 0;
  let totalAscentM = 0;
  let totalDescentM = 0;
  const nodes: PathNode[] = [];

  for (let i = 0; i < pathIndices.length; i += 1) {
    const idx = pathIndices[i]!;
    const col = idx % width;
    const row = Math.floor(idx / width);
    const elev = elevationM[idx] ?? 0;

    if (i > 0) {
      const prevIdx = pathIndices[i - 1]!;
      const prevCol = prevIdx % width;
      const prevRow = Math.floor(prevIdx / width);
      const prevElev = elevationM[prevIdx] ?? 0;
      const segDist = Math.hypot(col - prevCol, row - prevRow) * cellSizeM;
      totalDistM += segDist;
      const diff = elev - prevElev;
      if (diff > 0) totalAscentM += diff;
      else totalDescentM += Math.abs(diff);
    }

    nodes.push({
      column: col,
      row,
      eastM: col * cellSizeM,
      northM: (height - 1 - row) * cellSizeM,
      elevationM: elev,
      slopeDeg: slopeDeg[idx] ?? 0,
      skyViewFactor: skyViewFactor[idx] ?? 1.0,
      thermalInertiaTiu: thermalInertiaTiu[idx] ?? 400,
      radioLoS: radioViewshed[idx] ?? 1,
      mineralClass: mineralClass[idx] ?? 0
    });
  }

  return {
    success: true,
    nodes,
    totalDistanceM: totalDistM,
    totalAscentM,
    totalDescentM,
    computeTimeMs: performance.now() - startTime
  };
};

export const findNearestShelter = (
  grid: TerrainGrid,
  derived: DerivedTerrain,
  radioViewshed: Uint8Array,
  current: GridCell
): PathResult => {
  const startTime = performance.now();
  const { width, height, cellSizeM } = grid;
  const { slopeDeg, skyViewFactor, thermalInertiaTiu } = derived;

  let minSkyView = 1.0;
  for (let i = 0; i < skyViewFactor.length; i += 1) {
    const val = skyViewFactor[i] ?? 1.0;
    if (val < minSkyView) minSkyView = val;
  }
  const shelterThreshold = minSkyView + 0.05;

  let bestCell: GridCell | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let r = 0; r < height; r += 1) {
    for (let c = 0; c < width; c += 1) {
      const idx = r * width + c;
      const sv = skyViewFactor[idx] ?? 1.0;
      const slope = slopeDeg[idx] ?? 0;
      const ti = thermalInertiaTiu[idx] ?? 400;

      if (sv <= shelterThreshold && isCellTraversable(slope, ti)) {
        const dist = Math.hypot(c - current.column, r - current.row) * cellSizeM;
        const score = dist + (sv - minSkyView) * 1000;
        if (score < bestScore) {
          bestScore = score;
          bestCell = { column: c, row: r };
        }
      }
    }
  }

  if (bestCell === null) {
    return {
      success: false,
      failureReason: "NO_SHELTER_WITHIN_TERRAIN",
      nodes: [],
      totalDistanceM: 0,
      totalAscentM: 0,
      totalDescentM: 0,
      computeTimeMs: performance.now() - startTime
    };
  }

  const route = findRoute(grid, derived, radioViewshed, current, bestCell, "SEP_EMERGENCY");
  return {
    ...route,
    computeTimeMs: performance.now() - startTime
  };
};
