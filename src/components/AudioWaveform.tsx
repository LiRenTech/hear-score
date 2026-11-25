import { useLayoutEffect, useMemo, useRef } from "react";
import { formatTime } from "../lib/audio";
import { waveformEnvelope } from "../lib/waveform";

interface Props {
  samples?: Float32Array;
  duration: number;
  time: number;
  scale: number;
  width: number;
  onSeek: (time: number) => void;
  onHover: (x: number | null) => void;
  seekEnabled?: boolean;
}

export default function AudioWaveform({ samples, duration, time, scale, width, onSeek, onHover, seekEnabled = true }: Props) {
  const waveformRef = useRef<HTMLDivElement>(null);
  const hoverClientX = useRef<number | null>(null);
  const seekable = duration > 0 && seekEnabled;
  useLayoutEffect(() => {
    const update = () => {
      const element = waveformRef.current;
      if (!element || hoverClientX.current === null || !seekable) return onHover(null);
      const x = hoverClientX.current - element.getBoundingClientRect().left;
      onHover(Math.max(0, Math.min(duration * scale, x)));
    };
    update();
    // Keep the preview under the stationary pointer during scrolling and zooming.
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      onHover(null);
    };
  }, [seekable, duration, scale, onHover]);
  // Keep long recordings bounded in complexity. SVG scales the envelope to the
  // exact audio duration; unused timeline space remains empty, just like notes.
  const columns = Math.max(1, Math.min(12000, Math.ceil(duration * scale)));
  const path = useMemo(() => {
    if (!samples?.length) return "";
    const { low, high } = waveformEnvelope(samples, columns);
    const points = ["M0 40"];
    for (let x = 0; x < columns; x++) points.push(`L${x} ${40 - high[x] * 35}`);
    for (let x = columns - 1; x >= 0; x--) points.push(`L${x + 1} ${40 - low[x] * 35}`);
    points.push("Z");
    return points.join(" ");
  }, [samples, columns]);

  return (
    <div
      className="waveform"
      ref={waveformRef}
      onPointerMove={(event) => {
        if (!seekable || event.buttons !== 0) {
          hoverClientX.current = null;
          onHover(null);
          return;
        }
        hoverClientX.current = event.clientX;
        const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
        onHover(Math.max(0, Math.min(duration * scale, x)));
      }}
      onPointerLeave={() => { hoverClientX.current = null; onHover(null); }}
      onPointerDown={() => { hoverClientX.current = null; onHover(null); }}
      role={seekable ? "slider" : "img"}
      aria-label="播放进度"
      aria-valuemin={seekable ? 0 : undefined}
      aria-valuemax={seekable ? duration : undefined}
      aria-valuenow={seekable ? time : undefined}
      aria-valuetext={seekable ? `${formatTime(time)} / ${formatTime(duration)}` : undefined}
      tabIndex={seekable ? 0 : -1}
      onKeyDown={(event) => {
        if (!seekable) return;
        const positions: Record<string, number> = {
          ArrowRight: time + 2, ArrowLeft: time - 2, Home: 0, End: duration,
        };
        if (event.key in positions) {
          event.preventDefault();
          onSeek(Math.max(0, Math.min(duration, positions[event.key])));
        }
      }}
      onClick={(event) => {
        if (!seekable || event.button !== 0) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        onSeek(Math.max(0, Math.min(duration, (event.clientX - bounds.left) / scale)));
      }}
    >
      <svg width={width} height={80} aria-hidden="true">
        <line x1={0} x2={seekable ? duration * scale : width} y1={40} y2={40} stroke="var(--wave-idle)" />
        <path d={path} transform={`scale(${duration * scale / columns} 1)`} fill="var(--wave)" />
      </svg>
      {!seekable && <span>{seekEnabled ? "你的声音，从这里开始" : "正在聆听，音符随哼唱实时出现"}</span>}
    </div>
  );
}
