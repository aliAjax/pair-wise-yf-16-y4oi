import { REPAIR_SPOTS } from "./model";

interface SnowboardMarkerProps {
  spots: string[]; // 已选修补位置 id
  damaged: boolean;
  editable: boolean;
  onToggle?: (spotId: string) => void;
}

// 6 个分区（板头 → 板尾），纵向底板示意
const ZONE_Y: Record<string, number> = {
  tip: 24,
  front: 62,
  middle: 100,
  waist: 138,
  rear: 176,
  tail: 214,
};

// 雪板轮廓（圆角长条）
const BOARD_PATH =
  "M 50 6 C 66 6 74 20 74 46 L 74 198 C 74 224 66 238 50 238 C 34 238 26 224 26 198 L 26 46 C 26 20 34 6 50 6 Z";

export function SnowboardMarker({ spots, damaged, editable, onToggle }: SnowboardMarkerProps) {
  return (
    <div className={"board-svg" + (damaged ? "" : " no-damage")}>
      <svg viewBox="0 0 100 244" role="img" aria-label="底板修补位置示意图">
        <path d={BOARD_PATH} fill="#f1f5f9" stroke="#94a3b8" strokeWidth="2" />
        {/* 固定器位置示意 */}
        <ellipse cx="50" cy="62" rx="16" ry="9" fill="#cbd5e1" />
        <ellipse cx="50" cy="176" rx="16" ry="9" fill="#cbd5e1" />

        {REPAIR_SPOTS.map((spot) => {
          const selected = damaged && spots.includes(spot.id);
          const y = ZONE_Y[spot.id];
          return (
            <g key={spot.id}>
              <line
                x1="30"
                y1={y}
                x2="70"
                y2={y}
                stroke={selected ? "#f97316" : "#cbd5e1"}
                strokeWidth={selected ? 2 : 1}
                strokeDasharray="3 3"
              />
              {selected && (
                <path
                  d={`M 44 ${y - 6} l 3 7 l 7 -8`}
                  fill="none"
                  stroke="#ea580c"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              <text
                x="78"
                y={y + 3.5}
                fontSize="11"
                fill={selected ? "#ea580c" : "#94a3b8"}
              >
                {spot.short}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="spot-chips">
        {REPAIR_SPOTS.map((spot) => {
          const selected = damaged && spots.includes(spot.id);
          return (
            <button
              key={spot.id}
              type="button"
              className={"spot-chip" + (selected ? " selected" : "")}
              disabled={!editable || !damaged}
              aria-pressed={selected}
              onClick={() => onToggle?.(spot.id)}
              title={spot.label}
            >
              {spot.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
