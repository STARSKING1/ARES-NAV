import type { PathNode } from "../routing/pathfinder";
import type { Waypoint } from "../waypoints/waypointsData";
import { PNR_CRITICAL_FRACTION } from "../core/constants";

interface VisorHudProps {
  readonly pathNodes: ReadonlyArray<PathNode>;
  readonly activeWaypoint: Waypoint | null;
  readonly isSepStormActive: boolean;
  readonly onTriggerSepStorm: () => void;
  readonly onResetSepStorm: () => void;
  readonly o2RemainingKg: number;
  readonly o2RemainingPercent: number;
  readonly batteryWh: number;
  readonly cumulativeDoseMSv: number;
  readonly metabolicWatts: number;
  readonly pnrStatus: "NOMINAL" | "CAUTION" | "CRITICAL_WALKBACK";
}


export const VisorHud = ({
  pathNodes,
  activeWaypoint,
  isSepStormActive,
  onTriggerSepStorm,
  onResetSepStorm,
  o2RemainingKg,
  o2RemainingPercent,
  batteryWh,
  cumulativeDoseMSv,
  metabolicWatts,
  pnrStatus,
}: VisorHudProps) => {
  const nextNode = pathNodes[0];
  const targetNode = pathNodes[pathNodes.length - 1];

  let bearingDeg = 0;
  let distanceM = 0;
  let elevationDeltaM = 0;

  if (nextNode && targetNode) {
    const deltaEast = targetNode.eastM - nextNode.eastM;
    const deltaNorth = targetNode.northM - nextNode.northM;
    distanceM = pathNodes.reduce((sum, node, index) => {
      if (index === 0) return sum;
      const previous = pathNodes[index - 1]!;
      return sum + Math.hypot(node.eastM - previous.eastM, node.northM - previous.northM);
    }, 0);
    elevationDeltaM = targetNode.elevationM - nextNode.elevationM;
    const rad = Math.atan2(deltaEast, deltaNorth);
    bearingDeg = Math.round((rad * 180) / Math.PI);
    if (bearingDeg < 0) bearingDeg += 360;
  }

  const radRateMicroSv = isSepStormActive ? 266.0 : 26.6;

  return (
    <div className={`visor-hud-container ${isSepStormActive ? "sep-alert" : ""}`}>
      {isSepStormActive && (
        <div className="sep-banner">
          <span className="sep-blink">⚠ SIMULATED SEP SCENARIO - DOSE INPUT ×10 - EMERGENCY SHELTER REROUTE ACTIVE ⚠</span>
        </div>
      )}

      <div className="visor-top-bar">
        <div className="visor-heading">
          <span className="hud-sub">BEARING</span>
          <span className="hud-value large">{bearingDeg.toString().padStart(3, "0")}°</span>
          <div className="compass-tape">
            <span>{(bearingDeg - 30 + 360) % 360}°</span>
            <span className="center-mark">▼ {bearingDeg}° ▼</span>
            <span>{(bearingDeg + 30) % 360}°</span>
          </div>
        </div>

        <div className="visor-target">
          <span className="hud-sub">TARGET WAYPOINT</span>
          <span className="hud-value cyan">{isSepStormActive ? "MODELED SHELTER" : activeWaypoint ? activeWaypoint.code : "MANUAL CELL"}</span>
          <span className="hud-desc">{isSepStormActive ? "lowest modeled sky-view cell" : activeWaypoint ? activeWaypoint.name : "COORDINATE PIN"}</span>
        </div>

        <div className="visor-range">
          <span className="hud-sub">RANGE TO TARGET</span>
          <span className="hud-value large">{distanceM.toFixed(0)} m</span>
          <span className="hud-sub">Δ ELEVATION: {elevationDeltaM >= 0 ? `+${elevationDeltaM.toFixed(1)}` : elevationDeltaM.toFixed(1)} m</span>
        </div>
      </div>

      <div className="visor-center-reticle">
        <svg viewBox="0 0 300 160" className="hud-reticle-svg">
          <circle cx="150" cy="80" r="60" stroke="#00ff66" strokeWidth="1" strokeDasharray="3 4" fill="none" opacity="0.4" />
          <line x1="140" y1="80" x2="160" y2="80" stroke="#00ff66" strokeWidth="1.5" />
          <line x1="150" y1="70" x2="150" y2="90" stroke="#00ff66" strokeWidth="1.5" />
          <path d="M120,40 L110,40 L110,50" stroke="#00ff66" strokeWidth="1.5" fill="none" />
          <path d="M180,40 L190,40 L190,50" stroke="#00ff66" strokeWidth="1.5" fill="none" />
          <path d="M120,120 L110,120 L110,110" stroke="#00ff66" strokeWidth="1.5" fill="none" />
          <path d="M180,120 L190,120 L190,110" stroke="#00ff66" strokeWidth="1.5" fill="none" />
          <text x="150" y="24" fill="#00ff66" fontSize="9" fontFamily="monospace" textAnchor="middle">DEMO TERRAIN - NAV SIMULATION</text>
        </svg>
      </div>

      <div className="visor-bottom-grid">
        <div className="hud-card consumables">
          <div className="card-title">SUIT LIFE SUPPORT</div>
          <div className="hud-row">
            <span>O₂ REMAINING</span>
            <span className={o2RemainingPercent < (1 - PNR_CRITICAL_FRACTION) * 100 ? "crit" : "nominal"}>
              {o2RemainingKg.toFixed(2)} kg ({o2RemainingPercent.toFixed(0)}%)
            </span>
          </div>
          <div className="hud-progress-bg">
            <div className={`hud-progress-fill ${o2RemainingPercent < (1 - PNR_CRITICAL_FRACTION) * 100 ? "crit" : "nominal"}`} style={{ width: `${Math.min(100, Math.max(0, o2RemainingPercent))}%` }}></div>
          </div>
          <div className="hud-row">
            <span>BATTERY</span>
            <span className="nominal">{batteryWh.toFixed(0)} Wh</span>
          </div>
          <div className="hud-row">
            <span>METABOLIC WORK</span>
            <span>{metabolicWatts.toFixed(0)} W</span>
          </div>
        </div>

        <div className="hud-card radiation">
          <div className="card-title">DEMO DOSIMETRY MODEL</div>
          <div className="hud-row">
            <span>DOSE RATE</span>
            <span className={isSepStormActive ? "crit blink" : "nominal"}>{radRateMicroSv.toFixed(1)} µSv/h</span>
          </div>
          <div className="hud-row">
            <span>CUMULATIVE DOSE</span>
            <span>{cumulativeDoseMSv.toFixed(3)} mSv</span>
          </div>
          <div className="hud-row">
            <span>DEMO GCR INPUT</span>
            <span className="dim">0.640 mSv/day model input</span>
          </div>
        </div>

        <div className="hud-card pnr">
          <div className="card-title">POINT OF NO RETURN</div>
          <div className={`pnr-badge ${pnrStatus.toLowerCase()}`}>{pnrStatus}</div>
          <div className="hud-row">
            <span>RETURN O₂ MARGIN</span>
            <span className={o2RemainingPercent >= (1 - PNR_CRITICAL_FRACTION) * 100 ? "nominal" : "crit"}>{o2RemainingPercent.toFixed(0)}% REMAINING</span>
          </div>
          <div className="hud-row">
            <span>UHF COMM RELAY</span>
            <span className={nextNode?.radioLoS === 1 ? "nominal" : "crit"}>{nextNode?.radioLoS === 1 ? "UHF 437 MHz LOCKED" : "LOS SHADOWED"}</span>
          </div>
        </div>

        <div className="hud-card action">
          <div className="card-title">SURVIVAL ACTIONS</div>
          {isSepStormActive ? (
            <button type="button" className="hud-btn safe" onClick={onResetSepStorm}>STAND DOWN SEP ALERT - RESUME NOMINAL</button>
          ) : (
            <button type="button" className="hud-btn emergency" onClick={onTriggerSepStorm}>⚡ SIMULATE SOLAR PARTICLE EVENT (SEP)</button>
          )}
          <span className="hud-btn-note">APPLIES A MODELED DOSE MULTIPLIER AND ROUTES TO A LOW-SKY-VIEW CELL</span>
        </div>
      </div>
    </div>
  );
};
