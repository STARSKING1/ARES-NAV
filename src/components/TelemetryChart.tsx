import { useState } from "react";
import type { PathNode } from "../routing/pathfinder";
import { PNR_CRITICAL_FRACTION, PNR_CAUTION_FRACTION } from "../core/constants";
import { DEFAULT_MISSION_RESOURCES, type MissionMetrics } from "../routing/missionMetrics";
import { metabolicRateWatts, DEFAULT_CREW_PROFILE } from "../core/pnrCalculator";
import { MARS_GRAVITY_MS2, OXYGEN_DENSITY_KG_PER_LITRE_STP, OXYGEN_ENERGY_EQUIVALENT_J_PER_LITRE } from "../core/constants";

interface TelemetryChartProps {
  readonly nodes: ReadonlyArray<PathNode>;
  readonly totalDistanceM: number;
  readonly metrics: MissionMetrics;
  readonly isSepStormActive: boolean;
}

export const TelemetryChart = ({ nodes, totalDistanceM, metrics, isSepStormActive }: TelemetryChartProps) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (nodes.length < 2) {
    return (
      <div className="chart-empty">
        <span>AWAITING TRAVERSE PATH GENERATION...</span>
      </div>
    );
  }

  const width = 640;
  const height = 180;
  const padLeft = 45;
  const padRight = 45;
  const padTop = 20;
  const padBottom = 28;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  let minElev = Number.POSITIVE_INFINITY;
  let maxElev = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < nodes.length; i += 1) {
    const el = nodes[i]?.elevationM ?? 0;
    if (el < minElev) minElev = el;
    if (el > maxElev) maxElev = el;
  }
  const elevRange = Math.max(10, maxElev - minElev);

  const points: Array<{ x: number; y: number; node: PathNode; distM: number; o2Pct: number; doseMSv: number }> = [];
  let cumDist = 0;
  let cumDose = 0;
  let cumEnergyJ = 0;

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]!;
    if (i > 0) {
      const prev = nodes[i - 1]!;
      const segmentDistanceM = Math.hypot(node.eastM - prev.eastM, node.northM - prev.northM);
      cumDist += segmentDistanceM;
      const durationS = segmentDistanceM / DEFAULT_CREW_PROFILE.walkingSpeedMs;
      const gradePercent = segmentDistanceM > 0 ? ((node.elevationM - prev.elevationM) / segmentDistanceM) * 100 : 0;
      cumEnergyJ += metabolicRateWatts(DEFAULT_CREW_PROFILE, gradePercent, MARS_GRAVITY_MS2) * durationS;
      const doseRateMSvPerS = (DEFAULT_MISSION_RESOURCES.radiationRateMSvPerDay / 86400) * (isSepStormActive ? 10 : 1) * node.skyViewFactor;
      cumDose += doseRateMSvPerS * durationS;
    }
    const xFraction = totalDistanceM > 0 ? cumDist / totalDistanceM : 0;
    const x = padLeft + xFraction * plotWidth;
    const yFraction = (node.elevationM - minElev) / elevRange;
    const y = padTop + plotHeight - yFraction * plotHeight;
    const oxygenUsedKg = (cumEnergyJ / OXYGEN_ENERGY_EQUIVALENT_J_PER_LITRE) * OXYGEN_DENSITY_KG_PER_LITRE_STP;
    const oxygenRemainingFraction = Math.max(
      0,
      (DEFAULT_MISSION_RESOURCES.oxygenCapacityKg - oxygenUsedKg) /
        DEFAULT_MISSION_RESOURCES.oxygenCapacityKg
    );

    points.push({ x, y, node, distM: cumDist, o2Pct: oxygenRemainingFraction * 100, doseMSv: cumDose });
  }

  const elevPathD = points.reduce((acc, pt, idx) => {
    return `${acc} ${idx === 0 ? "M" : "L"} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
  }, "");

  const fillAreaD = `${elevPathD} L ${(padLeft + plotWidth).toFixed(1)},${(padTop + plotHeight).toFixed(1)} L ${padLeft.toFixed(1)},${(padTop + plotHeight).toFixed(1)} Z`;

  const o2PathD = points.reduce((acc, pt, idx) => {
    const o2Y = padTop + plotHeight - (pt.o2Pct / 100) * plotHeight;
    return `${acc} ${idx === 0 ? "M" : "L"} ${pt.x.toFixed(1)},${o2Y.toFixed(1)}`;
  }, "");

  const activePoint = hoverIndex !== null ? points[hoverIndex] : null;
  const finalO2 = Math.max(0, 100 - metrics.oxygenUsedKg / DEFAULT_MISSION_RESOURCES.oxygenCapacityKg * 100);
  const pnrThresholdY = padTop + plotHeight * PNR_CRITICAL_FRACTION;

  return (
    <div className="telemetry-chart-container">
      <div className="chart-legend">
        <span className="legend-item elevation">
          <span className="legend-line line-elev"></span> ELEVATION ({minElev.toFixed(0)}m - {maxElev.toFixed(0)}m)
        </span>
        <span className="legend-item o2">
          <span className="legend-line line-o2"></span> SUIT O₂ RESERVE ({finalO2.toFixed(0)}%)
        </span>
        <span className="legend-item pnr">
          <span className="legend-line line-pnr"></span> PNR CRITICAL ({((1 - PNR_CRITICAL_FRACTION) * 100).toFixed(0)}% MINIMUM)
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="telemetry-chart-svg"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <line x1={padLeft} y1={padTop + plotHeight} x2={padLeft + plotWidth} y2={padTop + plotHeight} stroke="#164e63" strokeWidth="1" />
        <line x1={padLeft} y1={padTop} x2={padLeft} y2={padTop + plotHeight} stroke="#164e63" strokeWidth="1" />
        <line x1={padLeft} y1={pnrThresholdY} x2={padLeft + plotWidth} y2={pnrThresholdY} stroke="#ef4444" strokeWidth="1" strokeDasharray="4 4" />
        <line x1={padLeft} y1={padTop + plotHeight * PNR_CAUTION_FRACTION} x2={padLeft + plotWidth} y2={padTop + plotHeight * PNR_CAUTION_FRACTION} stroke="#f59e0b" strokeWidth="1" strokeDasharray="2 4" />
        <path d={fillAreaD} fill="#22d3ee" fillOpacity="0.12" />
        <path d={elevPathD} fill="none" stroke="#22d3ee" strokeWidth="2" />
        <path d={o2PathD} fill="none" stroke="#10b981" strokeWidth="1.5" strokeDasharray="3 2" />

        {points.map((pt, idx) => (
          <circle key={idx} cx={pt.x} cy={pt.y} r="4" fill="transparent" className="chart-hover-trigger" onMouseEnter={() => setHoverIndex(idx)} />
        ))}

        {activePoint && (
          <g>
            <line x1={activePoint.x} y1={padTop} x2={activePoint.x} y2={padTop + plotHeight} stroke="#f59e0b" strokeWidth="1" strokeDasharray="2 2" />
            <circle cx={activePoint.x} cy={activePoint.y} r="4" fill="#22d3ee" stroke="#ffffff" strokeWidth="1.5" />
          </g>
        )}

        <text x={padLeft} y={height - 8} fill="#737373" fontSize="10" fontFamily="monospace">0m</text>
        <text x={padLeft + plotWidth} y={height - 8} fill="#737373" fontSize="10" fontFamily="monospace" textAnchor="end">{totalDistanceM.toFixed(0)}m</text>
        <text x={padLeft - 6} y={padTop + 10} fill="#22d3ee" fontSize="10" fontFamily="monospace" textAnchor="end">{maxElev.toFixed(0)}m</text>
        <text x={padLeft - 6} y={padTop + plotHeight} fill="#22d3ee" fontSize="10" fontFamily="monospace" textAnchor="end">{minElev.toFixed(0)}m</text>
      </svg>

      <div className="chart-summary">
        WALKBACK MARGIN: {metrics.pnrStatus}
        {" - "}MAX SLOPE: {metrics.maximumSlopeDeg.toFixed(1)}°{ " - "}
        DOSE: {metrics.radiationDoseMSv.toFixed(3)} mSv
      </div>

      {activePoint && (
        <div className="chart-tooltip">
          <span>DIST: {activePoint.distM.toFixed(0)}m</span>
          <span>ELEV: {activePoint.node.elevationM.toFixed(1)}m</span>
          <span>SLOPE: {activePoint.node.slopeDeg.toFixed(1)}°</span>
          <span>O₂: {activePoint.o2Pct.toFixed(1)}%</span>
          <span>DOSE: {(activePoint.doseMSv * 1000).toFixed(2)} µSv</span>
        </div>
      )}
    </div>
  );
};
