import { useMemo, useState } from "react";
import {
  GALE_SITE,
  MARS_GRAVITY_MS2,
  SLOPE_ABORT_DEG,
  WAL_CAPACITY_PACKETS
} from "./core/constants";
import { generateGaleSector } from "./terrain/galeSectorGenerator";
import { deriveTerrain } from "./terrain/terrainAnalysis";
import type { GridCell } from "./terrain/terrainTypes";
import { computeRadioViewshed } from "./routing/viewshed";
import {
  findRoute,
  findNearestShelter,
  type PathResult,
  type RoutingMode
} from "./routing/pathfinder";
import { calculateMissionMetrics, DEFAULT_MISSION_RESOURCES } from "./routing/missionMetrics";
import { GALE_WAYPOINTS, type Waypoint } from "./waypoints/waypointsData";
import { TacticalMap, type ActiveLayer } from "./components/TacticalMap";
import { TelemetryChart } from "./components/TelemetryChart";
import { VisorHud } from "./components/VisorHud";
import { WaypointModal } from "./components/WaypointModal";

type OperationalMode = "HABITAT" | "VISOR";

export const App = () => {
  const [mode, setMode] = useState<OperationalMode>("HABITAT");
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>("TOPOGRAPHY_SLOPE");
  const [routingMode, setRoutingMode] = useState<RoutingMode>("BALANCED");
  const [activeWaypoint, setActiveWaypoint] = useState<Waypoint | null>(GALE_WAYPOINTS[1] ?? null);
  const [customTargetCell, setCustomTargetCell] = useState<GridCell | null>(null);
  const [inspectingWaypoint, setInspectingWaypoint] = useState<Waypoint | null>(null);
  const [isSepStormActive, setIsSepStormActive] = useState<boolean>(false);

  const habitatCell: GridCell = useMemo(() => ({ column: 15, row: 15 }), []);

  const grid = useMemo(
    () => generateGaleSector({ width: 100, height: 100, cellSizeM: 10, habitatCell }),
    [habitatCell]
  );

  const derived = useMemo(() => deriveTerrain(grid, 250), [grid]);

  const radioViewshed = useMemo(
    () => computeRadioViewshed(grid, habitatCell, { mastHeightM: 5.0, receiverHeightM: 2.0 }),
    [grid, habitatCell]
  );

  const targetCell: GridCell = useMemo(() => {
    if (customTargetCell) return customTargetCell;
    if (activeWaypoint) return activeWaypoint.cell;
    return { column: 48, row: 42 };
  }, [customTargetCell, activeWaypoint]);

  const pathResult: PathResult = useMemo(() => {
    if (isSepStormActive) {
      return findNearestShelter(grid, derived, radioViewshed, habitatCell);
    }
    return findRoute(grid, derived, radioViewshed, habitatCell, targetCell, routingMode);
  }, [grid, derived, radioViewshed, habitatCell, targetCell, routingMode, isSepStormActive]);

  const missionMetrics = useMemo(
    () => calculateMissionMetrics(pathResult.nodes, {
      ...DEFAULT_MISSION_RESOURCES,
      sepMultiplier: isSepStormActive ? 10 : 1
    }),
    [pathResult, isSepStormActive]
  );

  const pnrStatus = missionMetrics.pnrStatus;

  const handleSelectWaypoint = (wp: Waypoint) => {
    setCustomTargetCell(null);
    setActiveWaypoint(wp);
  };

  const handleSetCustomCell = (cell: GridCell) => {
    setActiveWaypoint(null);
    setCustomTargetCell(cell);
  };

  const handleTriggerSepStorm = () => {
    setIsSepStormActive(true);
  };

  const handleResetSepStorm = () => {
    setIsSepStormActive(false);
  };

  return (
    <div className={mode === "VISOR" ? "console visor" : "console habitat"}>
      <header className="bar">
        <div className="brand-section">
          <span className="title">ARES-NAV</span>
          <span className="tagline">EVA SURVIVAL & RECON NAVIGATOR - GALE CRATER</span>
          <div className="edge-badge">
            <span className="badge-dot"></span>
            <span>SYNTHETIC DEMO TERRAIN - NOT OFFLINE-CERTIFIED</span>
          </div>
        </div>
        <div className="mode-switch" role="group" aria-label="Operational mode">
          <button
            type="button"
            className={mode === "HABITAT" ? "mode-button active" : "mode-button"}
            onClick={() => setMode("HABITAT")}
          >
            HABITAT PLANNER
          </button>
          <button
            type="button"
            className={mode === "VISOR" ? "mode-button active" : "mode-button"}
            onClick={() => setMode("VISOR")}
          >
            SUIT VISOR HUD
          </button>
        </div>
      </header>

      {mode === "HABITAT" ? (
        <div className="habitat-layout">
          <main className="habitat-main">
            <div className="layer-toolbar">
              <span className="toolbar-label">DEMO LAYERS:</span>
              <button
                type="button"
                className={`layer-btn ${activeLayer === "TOPOGRAPHY_SLOPE" ? "active" : ""}`}
                onClick={() => setActiveLayer("TOPOGRAPHY_SLOPE")}
              >
                1. SYNTHETIC SLOPE ({SLOPE_ABORT_DEG}° CAUTION)
              </button>
              <button
                type="button"
                className={`layer-btn ${activeLayer === "CRISM_MINERALS" ? "active" : ""}`}
                onClick={() => setActiveLayer("CRISM_MINERALS")}
              >
                2. SYNTHETIC MINERAL CLASSES
              </button>
              <button
                type="button"
                className={`layer-btn ${activeLayer === "THEMIS_INERTIA" ? "active" : ""}`}
                onClick={() => setActiveLayer("THEMIS_INERTIA")}
              >
                3. SYNTHETIC THERMAL INERTIA
              </button>
              <button
                type="button"
                className={`layer-btn ${activeLayer === "RAD_SKYVIEW" ? "active" : ""}`}
                onClick={() => setActiveLayer("RAD_SKYVIEW")}
              >
                4. MODELED SKY-VIEW FACTOR
              </button>
              <button
                type="button"
                className={`layer-btn ${activeLayer === "REMS_LOS" ? "active" : ""}`}
                onClick={() => setActiveLayer("REMS_LOS")}
              >
                5. MODELED UHF LoS
              </button>
            </div>

            <div className="map-view-wrapper">
              <TacticalMap
                grid={grid}
                derived={derived}
                radioViewshed={radioViewshed}
                activeLayer={activeLayer}
                pathNodes={pathResult.nodes}
                waypoints={GALE_WAYPOINTS}
                activeWaypoint={activeWaypoint}
                onSelectWaypoint={(wp) => setInspectingWaypoint(wp)}
                onSetCustomCell={handleSetCustomCell}
              />
            </div>

            <div className="bottom-telemetry-panel">
              <TelemetryChart
                nodes={pathResult.nodes}
                totalDistanceM={pathResult.totalDistanceM}
                metrics={missionMetrics}
                isSepStormActive={isSepStormActive}
              />
            </div>
          </main>

          <aside className="habitat-sidebar">
            <section className="sidebar-section">
              <div className="sidebar-title">
                <span>ROUTE OPTIMIZATION</span>
                <span className="stat-label">{pathResult.computeTimeMs.toFixed(1)}ms demo</span>
              </div>
              <div className="route-presets">
                <button
                  type="button"
                  className={`preset-btn ${routingMode === "BALANCED" && !isSepStormActive ? "active" : ""}`}
                  onClick={() => {
                    setIsSepStormActive(false);
                    setRoutingMode("BALANCED");
                  }}
                >
                  BALANCED
                </button>
                <button
                  type="button"
                  className={`preset-btn ${routingMode === "MAX_SAFETY" && !isSepStormActive ? "active" : ""}`}
                  onClick={() => {
                    setIsSepStormActive(false);
                    setRoutingMode("MAX_SAFETY");
                  }}
                >
                  MAX SAFETY
                </button>
                <button
                  type="button"
                  className={`preset-btn ${routingMode === "MAX_SCIENCE" && !isSepStormActive ? "active" : ""}`}
                  onClick={() => {
                    setIsSepStormActive(false);
                    setRoutingMode("MAX_SCIENCE");
                  }}
                >
                  MAX SCIENCE
                </button>
              </div>

              <div className="route-stats-grid">
                <div className="stat-box">
                  <div className="stat-label">TOTAL DISTANCE</div>
                  <div className="stat-value">{pathResult.success ? `${pathResult.totalDistanceM.toFixed(0)} m` : "NO ROUTE"}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">CUMULATIVE ASCENT</div>
                  <div className="stat-value">+{pathResult.totalAscentM.toFixed(1)} m</div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">ESTIMATED WALKING TIME</div>
                  <div className="stat-value">{missionMetrics.walkingDurationHours.toFixed(2)} h</div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">DEMO O₂ RESERVE STATUS</div>
                  <div className={`stat-value ${pnrStatus.toLowerCase()}`}>
                    {pnrStatus}
                  </div>
                </div>
              </div>
              {!pathResult.success && (
                <div className="route-error">Route unavailable: {pathResult.failureReason}</div>
              )}
            </section>

            <section className="sidebar-section">
              <div className="sidebar-title">
                <span>SEP SCENARIO SIMULATION</span>
              </div>
              <div className="sep-trigger-box">
                {isSepStormActive ? (
                  <button
                    type="button"
                    className="btn-sep-reset"
                    onClick={handleResetSepStorm}
                  >
                    STAND DOWN SEP ALERT - RESUME DEMO
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-sep-emergency"
                    onClick={handleTriggerSepStorm}
                  >
                    ⚡ SIMULATE SEP SCENARIO
                  </button>
                )}
                <span className="sep-note">
                  Applies a 10x illustrative dose multiplier and routes toward a modeled low-sky-view cell.
                </span>
              </div>
            </section>

            <section className="sidebar-section">
              <div className="sidebar-title">
                <span>ILLUSTRATIVE WAYPOINTS ({GALE_WAYPOINTS.length})</span>
              </div>
              <div className="waypoints-list">
                {GALE_WAYPOINTS.map((wp) => {
                  const isCurrent = activeWaypoint?.id === wp.id;
                  return (
                    <div
                      key={wp.id}
                      className={`wp-item ${isCurrent ? "active" : ""}`}
                      onClick={() => handleSelectWaypoint(wp)}
                    >
                      <div className="wp-info">
                        <span className="wp-code">{wp.code} - {wp.priority}</span>
                        <span className="wp-name">{wp.name}</span>
                      </div>
                      <div className="wp-actions">
                        <button
                          type="button"
                          className="btn-inspect"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectingWaypoint(wp);
                          }}
                        >
                          DEMO POV
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="sidebar-section">
              <div className="sidebar-title">
                <span>SITE SPECIFICATION</span>
              </div>
              <table className="readout">
                <tbody>
                  <tr>
                    <th scope="row">REFERENCE LATITUDE</th>
                    <td>{Math.abs(GALE_SITE.latitudeDeg).toFixed(3)}°S</td>
                  </tr>
                  <tr>
                    <th scope="row">REFERENCE LONGITUDE</th>
                    <td>{GALE_SITE.longitudeDeg.toFixed(3)}°E</td>
                  </tr>
                  <tr>
                    <th scope="row">REFERENCE ELEVATION</th>
                    <td>{GALE_SITE.datumElevationM} m</td>
                  </tr>
                  <tr>
                    <th scope="row">MARS GRAVITY INPUT</th>
                    <td>{MARS_GRAVITY_MS2.toFixed(3)} m/s²</td>
                  </tr>
                  <tr>
                    <th scope="row">WAL CAPACITY CONFIG</th>
                    <td>{WAL_CAPACITY_PACKETS} pkts</td>
                  </tr>
                </tbody>
              </table>
              <p className="provenance-note">All mapped terrain and waypoint attributes are synthetic placeholders, not NASA observations. This research prototype is not operational safety software.</p>
            </section>
          </aside>
        </div>
      ) : (
        <VisorHud
          pathNodes={pathResult.nodes}
          activeWaypoint={activeWaypoint}
          isSepStormActive={isSepStormActive}
          onTriggerSepStorm={handleTriggerSepStorm}
          onResetSepStorm={handleResetSepStorm}
          o2RemainingKg={missionMetrics.remainingOxygenKg}
          o2RemainingPercent={missionMetrics.remainingOxygenFraction * 100}
          batteryWh={missionMetrics.remainingBatteryWh}
          cumulativeDoseMSv={missionMetrics.radiationDoseMSv}
          metabolicWatts={missionMetrics.meanMetabolicWatts}
          pnrStatus={pnrStatus}
        />
      )}

      {inspectingWaypoint && (
        <WaypointModal
          waypoint={inspectingWaypoint}
          onClose={() => setInspectingWaypoint(null)}
          onSetTarget={(wp) => handleSelectWaypoint(wp)}
          isCurrentTarget={activeWaypoint?.id === inspectingWaypoint.id}
        />
      )}
    </div>
  );
};
