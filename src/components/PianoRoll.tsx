import { useEffect, useRef } from "react";
import type { Note } from "../types";
import { pitchName } from "../lib/notes";
interface Props {
  notes: Note[];
  duration: number;
  time: number;
  processed: number;
  zoom: number;
  onSeek: (time: number) => void;
  empty: boolean;
}
const DEMO = [
  60, 64, 67, 72, 71, 67, 64, 62, 65, 69, 72, 74, 72, 67, 64, 60,
].map((pitch, i) => ({
  pitch,
  start: 0.5 + i * 0.55,
  duration: 0.45,
  confidence: 0.5,
}));
export default function PianoRoll({
  notes,
  duration,
  time,
  processed,
  zoom,
  onSeek,
  empty,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const shown = empty ? DEMO : notes;
  const low = Math.max(21, Math.min(48, ...shown.map((n) => n.pitch)) - 2);
  const high = Math.min(108, Math.max(76, ...shown.map((n) => n.pitch)) + 2);
  const rowHeight = 12;
  const header = 30;
  const height = (high - low + 1) * rowHeight + header;
  const scale = zoom * 48;
  const width = Math.max(750, (duration || 16) * scale);
  const pitchY = (p: number) => header + (high - p) * rowHeight;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !time) return;
    const x = time * scale;
    if (x > el.scrollLeft + el.clientWidth - 80 || x < el.scrollLeft)
      el.scrollLeft = Math.max(0, x - 100);
  }, [time, scale]);
  return (
    <div className={`roll ${empty ? "is-placeholder" : ""}`}>
      <div className="piano-keys" style={{ height }}>
        <div className="key-heading">音高</div>
        {Array.from({ length: high - low + 1 }, (_, i) => high - i).map((p) => (
          <div
            key={p}
            className={`piano-key ${[1, 3, 6, 8, 10].includes(p % 12) ? "black" : ""}`}
            style={{ height: rowHeight }}
          >
            {p % 12 === 0 ? pitchName(p) : ""}
          </div>
        ))}
      </div>
      <div className="roll-scroll" ref={scrollRef}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={
            empty
              ? "上传前的音符示意"
              : `识别到的 ${notes.length} 个音符，横轴时间，纵轴音高`
          }
          onClick={(e) => {
            if (!empty) {
              const rect = e.currentTarget.getBoundingClientRect();
              onSeek(
                Math.min(
                  duration,
                  Math.max(0, (e.clientX - rect.left) / scale),
                ),
              );
            }
          }}
        >
          {Array.from({ length: high - low + 1 }, (_, i) => high - i).map(
            (p) => (
              <g key={p}>
                <rect
                  x="0"
                  y={pitchY(p)}
                  width={width}
                  height={rowHeight}
                  fill={[1, 3, 6, 8, 10].includes(p % 12) ? "#f7f6fa" : "#fff"}
                />
                <line
                  x1="0"
                  x2={width}
                  y1={pitchY(p) + rowHeight}
                  y2={pitchY(p) + rowHeight}
                  stroke="#efedf4"
                />
              </g>
            ),
          )}
          {Array.from({ length: Math.ceil(width / scale) + 1 }, (_, i) => (
            <g key={i}>
              <line
                x1={i * scale}
                x2={i * scale}
                y1={header}
                y2={height}
                stroke={i % 4 === 0 ? "#dcd8e8" : "#efedf4"}
              />
              {i % 2 === 0 && (
                <text
                  x={i * scale + 8}
                  y="19"
                  fontSize="10"
                  fill="#9893a7"
                  fontFamily="monospace"
                >
                  {Math.floor(i / 60)}:{String(i % 60).padStart(2, "0")}
                </text>
              )}
            </g>
          ))}
          {!empty && processed > 0 && processed < duration && (
            <rect
              x={processed * scale}
              y={header}
              width={Math.max(0, width - processed * scale)}
              height={height - header}
              fill="#eeecf7"
              opacity="0.5"
            />
          )}
          {shown.map((n, i) => (
            <rect
              key={i}
              x={n.start * scale}
              y={pitchY(n.pitch) + 2}
              width={Math.max(3, n.duration * scale)}
              height={rowHeight - 3}
              rx="3"
              fill={n.pitch < 60 ? "#a19ad8" : "#7c6bd1"}
              opacity={
                empty ? 0.45 : Math.max(0.25, Math.min(1, n.confidence * 1.7))
              }
            >
              <title>
                {pitchName(n.pitch)} · {n.start.toFixed(2)}s ·{" "}
                {n.duration.toFixed(2)}s
              </title>
            </rect>
          ))}
          {!empty && (
            <g>
              <line
                x1={time * scale}
                x2={time * scale}
                y1={header}
                y2={height}
                stroke="#d99b56"
                strokeWidth="1.5"
              />
              <path
                d={`M${time * scale - 4} 25 L${time * scale + 4} 25 L${time * scale} 31Z`}
                fill="#d99b56"
              />
            </g>
          )}
        </svg>
      </div>
      {empty && (
        <div className="roll-placeholder-label">
          谱面示意 · 你的旋律即将在这里出现
        </div>
      )}
    </div>
  );
}
