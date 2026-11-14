import type { Waypoint } from "../waypoints/waypointsData";

interface WaypointModalProps {
  readonly waypoint: Waypoint | null;
  readonly onClose: () => void;
  readonly onSetTarget: (waypoint: Waypoint) => void;
  readonly isCurrentTarget: boolean;
}

export const WaypointModal = ({
  waypoint,
  onClose,
  onSetTarget,
  isCurrentTarget
}: WaypointModalProps) => {
  if (!waypoint) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-badge">{waypoint.code}</div>
          <h3 className="modal-title">{waypoint.name}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="pov-frame">
            <div className="pov-header">
              <span>DEMO IMAGE - {waypoint.mastcamInstrument} SOL {waypoint.mastcamSol}</span>
              <span className="pov-badge">ILLUSTRATIVE SCENE</span>
            </div>
            <div className="pov-display">
              <svg viewBox="0 0 400 180" className="pov-canvas" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8a4b38" />
                    <stop offset="70%" stopColor="#c17c5d" />
                    <stop offset="100%" stopColor="#e3a17e" />
                  </linearGradient>
                  <linearGradient id="groundGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7a2e1d" />
                    <stop offset="50%" stopColor="#5c1e13" />
                    <stop offset="100%" stopColor="#3d140c" />
                  </linearGradient>
                </defs>
                <rect x="0" y="0" width="400" height="90" fill="url(#skyGrad)" />
                <path d="M0,85 Q80,75 160,82 T320,78 T400,85 L400,180 L0,180 Z" fill="url(#groundGrad)" />
                <path d="M0,82 Q120,68 220,74 T400,70 L400,90 L0,90 Z" fill="#9e4e3b" opacity="0.6" />
                {waypoint.targetType === "SCIENCE_SULFATE" && (
                  <g stroke="#22d3ee" strokeWidth="2" fill="none" opacity="0.85">
                    <path d="M80,140 L130,95 L180,140 L230,100 L300,150" />
                    <path d="M110,130 L110,105 M160,135 L160,110 M210,125 L210,102" />
                    <path d="M260,140 L260,115 M140,115 L200,115" />
                  </g>
                )}
                {waypoint.targetType === "GEOLOGY_CONTACT" && (
                  <g fill="#262626" stroke="#525252">
                    <polygon points="120,130 135,115 155,120 148,138 125,142" />
                    <polygon points="210,145 230,125 255,130 245,152 215,155" />
                    <polygon points="70,150 85,140 100,145 90,160 75,162" />
                    <polygon points="290,135 310,120 330,128 320,148 295,150" />
                  </g>
                )}
                {waypoint.targetType === "SCIENCE_CLAY" && (
                  <g stroke="#34d399" strokeWidth="1.5" opacity="0.75" fill="none">
                    <path d="M30,130 Q100,125 180,128 T360,126" />
                    <path d="M20,145 Q110,140 200,142 T380,141" />
                    <path d="M40,160 Q120,155 220,158 T370,156" />
                  </g>
                )}
                {waypoint.targetType === "SHELTER" && (
                  <g fill="#171717">
                    <path d="M200,20 L400,10 L400,180 L180,180 Q240,110 200,20 Z" />
                    <path d="M220,60 Q270,110 240,180 L400,180 L400,50 Z" fill="#0a0a0a" />
                  </g>
                )}
                <circle cx="340" cy="30" r="12" fill="#ffedd5" opacity="0.4" />
                <line x1="20" y1="90" x2="380" y2="90" stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.5" />
                <text x="25" y="105" fill="#f59e0b" fontSize="8" fontFamily="monospace">HORIZON AZ 142°</text>
              </svg>
            </div>
            <div className="pov-caption">
              <strong>{waypoint.mastcamPovTitle}:</strong> {waypoint.povDescription}
            </div>
          </div>

          <table className="readout">
            <tbody>
              <tr>
                <th scope="row">GRID COORDINATES</th>
                <td>E {waypoint.eastM} m / N {waypoint.northM} m (Cell {waypoint.cell.column}, {waypoint.cell.row})</td>
              </tr>
              <tr>
                <th scope="row">SYNTHETIC SPECTRAL TAG</th>
                <td>{waypoint.crismSignature}</td>
              </tr>
              <tr>
                <th scope="row">ILLUSTRATIVE SCIENCE GOAL</th>
                <td>{waypoint.scientificObjective}</td>
              </tr>
              <tr>
                <th scope="row">SYNTHETIC HAZARD TAGS</th>
                <td className="hazard-text">{waypoint.surfaceHazards.join(" - ")}</td>
              </tr>
              <tr>
                <th scope="row">PRIORITY CLASSIFICATION</th>
                <td>
                  <span className={`priority-tag ${waypoint.priority.toLowerCase()}`}>
                    {waypoint.priority}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className={isCurrentTarget ? "btn active" : "btn primary"}
            onClick={() => {
              onSetTarget(waypoint);
              onClose();
            }}
          >
            {isCurrentTarget ? "CURRENT ACTIVE DESTINATION" : "SET AS ACTIVE EVA DESTINATION"}
          </button>
        </div>
      </div>
    </div>
  );
};
