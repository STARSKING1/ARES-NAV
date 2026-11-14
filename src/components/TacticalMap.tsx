import { useEffect, useRef, useState } from "react";
import type { GridCell, TerrainGrid, DerivedTerrain } from "../terrain/terrainTypes";
import type { PathNode } from "../routing/pathfinder";
import type { Waypoint } from "../waypoints/waypointsData";

export type ActiveLayer = "TOPOGRAPHY_SLOPE" | "CRISM_MINERALS" | "THEMIS_INERTIA" | "RAD_SKYVIEW" | "REMS_LOS";

interface TacticalMapProps {
  readonly grid: TerrainGrid;
  readonly derived: DerivedTerrain;
  readonly radioViewshed: Uint8Array;
  readonly activeLayer: ActiveLayer;
  readonly pathNodes: ReadonlyArray<PathNode>;
  readonly waypoints: ReadonlyArray<Waypoint>;
  readonly activeWaypoint: Waypoint | null;
  readonly onSelectWaypoint: (wp: Waypoint) => void;
  readonly onSetCustomCell: (cell: GridCell) => void;
}

export const TacticalMap = ({
  grid,
  derived,
  radioViewshed,
  activeLayer,
  pathNodes,
  waypoints,
  activeWaypoint,
  onSelectWaypoint,
  onSetCustomCell
}: TacticalMapProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverCell, setHoverCell] = useState<{ col: number; row: number; elev: number; slope: number; ti: number; sv: number; los: number } | null>(null);

  const { width, height, cellSizeM, elevationM, mineralClass } = grid;
  const { slopeDeg, skyViewFactor, thermalInertiaTiu } = derived;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    for (let r = 0; r < height; r += 1) {
      for (let c = 0; c < width; c += 1) {
        const idx = r * width + c;
        const px = idx * 4;

        if (activeLayer === "TOPOGRAPHY_SLOPE") {
          const slope = slopeDeg[idx] ?? 0;
          if (slope > 22.0) {
            data[px] = 239;
            data[px + 1] = 68;
            data[px + 2] = 68;
            data[px + 3] = 255;
          } else if (slope > 15.0) {
            data[px] = 245;
            data[px + 1] = 158;
            data[px + 2] = 11;
            data[px + 3] = 255;
          } else if (slope > 8.0) {
            data[px] = 234;
            data[px + 1] = 179;
            data[px + 2] = 8;
            data[px + 3] = 255;
          } else {
            const intensity = Math.min(255, Math.max(20, Math.floor((slope / 8.0) * 120 + 30)));
            data[px] = 16;
            data[px + 1] = intensity;
            data[px + 2] = 100;
            data[px + 3] = 255;
          }
        } else if (activeLayer === "CRISM_MINERALS") {
          const min = mineralClass[idx] ?? 0;
          if (min === 1) {
            data[px] = 52;
            data[px + 1] = 211;
            data[px + 2] = 153;
            data[px + 3] = 255;
          } else if (min === 2) {
            data[px] = 34;
            data[px + 1] = 211;
            data[px + 2] = 238;
            data[px + 3] = 255;
          } else if (min === 3) {
            data[px] = 217;
            data[px + 1] = 119;
            data[px + 2] = 6;
            data[px + 3] = 255;
          } else {
            data[px] = 38;
            data[px + 1] = 38;
            data[px + 2] = 42;
            data[px + 3] = 255;
          }
        } else if (activeLayer === "THEMIS_INERTIA") {
          const ti = thermalInertiaTiu[idx] ?? 400;
          if (ti < 150) {
            data[px] = 220;
            data[px + 1] = 38;
            data[px + 2] = 38;
            data[px + 3] = 255;
          } else {
            const val = Math.min(255, Math.floor((ti / 400) * 180 + 40));
            data[px] = 40;
            data[px + 1] = val;
            data[px + 2] = 180;
            data[px + 3] = 255;
          }
        } else if (activeLayer === "RAD_SKYVIEW") {
          const sv = skyViewFactor[idx] ?? 1.0;
          const shieldLevel = Math.max(0, Math.min(1, (sv - 0.75) / 0.25));
          data[px] = Math.floor(shieldLevel * 220);
          data[px + 1] = Math.floor((1 - shieldLevel) * 200);
          data[px + 2] = Math.floor((1 - shieldLevel) * 240);
          data[px + 3] = 255;
        } else {
          const los = radioViewshed[idx] ?? 0;
          if (los === 1) {
            data[px] = 6;
            data[px + 1] = 95;
            data[px + 2] = 120;
            data[px + 3] = 255;
          } else {
            data[px] = 15;
            data[px + 1] = 23;
            data[px + 2] = 42;
            data[px + 3] = 255;
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);

    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    for (let r = 0; r < height; r += 10) {
      ctx.fillRect(0, r, width, 1);
    }
    for (let c = 0; c < width; c += 10) {
      ctx.fillRect(c, 0, 1, height);
    }

    if (pathNodes.length > 1) {
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < pathNodes.length; i += 1) {
        const node = pathNodes[i]!;
        if (i === 0) ctx.moveTo(node.column, node.row);
        else ctx.lineTo(node.column, node.row);
      }
      ctx.stroke();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      for (let i = 0; i < pathNodes.length; i += 1) {
        const node = pathNodes[i]!;
        if (i === 0) ctx.moveTo(node.column, node.row);
        else ctx.lineTo(node.column, node.row);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const wp of waypoints) {
      const isSelected = activeWaypoint?.id === wp.id;
      ctx.beginPath();
      ctx.arc(wp.cell.column, wp.cell.row, isSelected ? 4.5 : 3, 0, 2 * Math.PI);
      ctx.fillStyle = wp.priority === "EMERGENCY" ? "#ef4444" : wp.priority === "CRITICAL" ? "#22d3ee" : "#f59e0b";
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#ffffff" : "#000000";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [grid, derived, radioViewshed, activeLayer, pathNodes, waypoints, activeWaypoint, width, height]);

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const col = Math.floor((event.clientX - rect.left) * scaleX);
    const row = Math.floor((event.clientY - rect.top) * scaleY);

    if (col >= 0 && col < width && row >= 0 && row < height) {
      const idx = row * width + col;
      setHoverCell({
        col,
        row,
        elev: elevationM[idx] ?? 0,
        slope: slopeDeg[idx] ?? 0,
        ti: thermalInertiaTiu[idx] ?? 400,
        sv: skyViewFactor[idx] ?? 1.0,
        los: radioViewshed[idx] ?? 0
      });
    }
  };

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const col = Math.floor((event.clientX - rect.left) * scaleX);
    const row = Math.floor((event.clientY - rect.top) * scaleY);

    if (col < 0 || col >= width || row < 0 || row >= height) return;

    const clickedWp = waypoints.find(
      (w) => Math.hypot(w.cell.column - col, w.cell.row - row) <= 3
    );
    if (clickedWp) {
      onSelectWaypoint(clickedWp);
    } else {
      onSetCustomCell({ column: col, row });
    }
  };

  return (
    <div className="tactical-map-wrapper">
      <div className="map-canvas-container">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="tactical-canvas"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverCell(null)}
          onClick={handleClick}
        />
        <div className="map-compass">
          <span className="compass-n">N</span>
        </div>
        <div className="map-scale">
          <span>{width * cellSizeM}m × {height * cellSizeM}m SECTOR</span>
          <span className="scale-bar">50m</span>
        </div>
      </div>

      <div className="map-telemetry-strip">
        {hoverCell ? (
          <>
            <span>POS: E {hoverCell.col * cellSizeM}m, N {(height - 1 - hoverCell.row) * cellSizeM}m</span>
            <span>ELEV: {hoverCell.elev.toFixed(1)}m</span>
            <span className={hoverCell.slope > 22 ? "hazard-text" : ""}>SLOPE: {hoverCell.slope.toFixed(1)}°</span>
            <span className={hoverCell.ti < 150 ? "hazard-text" : ""}>TI: {hoverCell.ti.toFixed(0)} TIU</span>
            <span>SKY-VIEW: {hoverCell.sv.toFixed(2)}</span>
            <span className={hoverCell.los === 1 ? "los-nominal" : "los-loss"}>
              COMMS: {hoverCell.los === 1 ? "UHF LINK OK" : "LOS BLOCKED"}
            </span>
          </>
        ) : (
          <span className="dim">HOVER GRID FOR CROSS-HAIR TELEMETRY - CLICK TO SET WAYPOINT</span>
        )}
      </div>
    </div>
  );
};
