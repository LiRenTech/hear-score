import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Note } from "../types";
import AudioWaveform from "./AudioWaveform";
import { BASE_PIXELS_PER_SECOND, MAX_ZOOM, minimumZoom, timelineStep, zoomedScrollLeft } from "../lib/timeline";
import { wheelAction, type InteractionSettings } from "../lib/settings";
import { PianoPreview } from "../lib/piano-preview";
import { pitchName } from "../lib/notes";
interface Props {
  interactionSettings: InteractionSettings;
  notes: Note[];
  samples?: Float32Array;
  duration: number;
  time: number;
  playing: boolean;
  getPlaybackTime: () => number | undefined;
  processed: number;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onMinZoomChange: (zoom: number) => void;
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
  interactionSettings,
  notes,
  samples,
  duration,
  time,
  playing,
  getPlaybackTime,
  processed,
  zoom,
  onZoomChange,
  onMinZoomChange,
  onSeek,
  empty,
}: Props) {
  const previewRef = useRef<PianoPreview | null>(null);
  const auditionRef = useRef<{ pointerId: number; element: HTMLDivElement; pitch: number | null } | null>(null);
  const [auditionPitch, setAuditionPitch] = useState<number | null>(null);
  const [auditionError, setAuditionError] = useState("");
  const hoverHeadRef = useRef<HTMLDivElement>(null);
  const hoverLineRef = useRef<SVGLineElement>(null);
  const showSeekPreview = useCallback((x: number | null) => {
    if (hoverHeadRef.current) {
      hoverHeadRef.current.style.display = x === null ? "none" : "block";
      if (x !== null) hoverHeadRef.current.style.transform = `translateX(${x}px)`;
    }
    if (hoverLineRef.current) {
      hoverLineRef.current.style.display = x === null ? "none" : "block";
      if (x !== null) hoverLineRef.current.setAttribute("transform", `translate(${x} 0)`);
    }
  }, []);
  const stopAudition = useCallback(() => {
    previewRef.current?.stop();
    setAuditionPitch(null);
    const active = auditionRef.current;
    auditionRef.current = null;
    if (active?.element.hasPointerCapture(active.pointerId))
      active.element.releasePointerCapture(active.pointerId);
  }, []);
  useLayoutEffect(() => {
    const hide = () => { if (document.hidden) stopAudition(); };
    window.addEventListener("blur", stopAudition);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("blur", stopAudition);
      document.removeEventListener("visibilitychange", hide);
      stopAudition();
      previewRef.current?.dispose();
      previewRef.current = null;
    };
  }, [stopAudition]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const waveformPlayheadRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<SVGGElement>(null);
  const zoomAnchorRef = useRef<number | null>(null);
  const verticalZoomAnchorRef = useRef<number | null>(null);
  const followAfterRef = useRef(0);
  const lastTimeRef = useRef(time);
  const panRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const stopPan = useCallback(() => {
    const pan = panRef.current;
    if (!pan) return;
    panRef.current = null;
    const el = scrollRef.current;
    el?.classList.remove("is-panning");
    if (el?.hasPointerCapture(pan.pointerId)) el.releasePointerCapture(pan.pointerId);
    followAfterRef.current = performance.now() + 1000;
  }, []);
  useLayoutEffect(() => {
    window.addEventListener("blur", stopPan);
    return () => {
      window.removeEventListener("blur", stopPan);
      stopPan();
    };
  }, [stopPan]);
  useLayoutEffect(() => {
    if (!interactionSettings.middleDrag) stopPan();
  }, [interactionSettings.middleDrag, stopPan]);
  const shown = empty ? DEMO : notes;
  const [low, high] = useMemo(() => {
    let low = 21;
    let high = 108;
    for (const note of shown) {
      low = Math.min(low, note.pitch);
      high = Math.max(high, note.pitch);
    }
    return [low, high];
  }, [shown]);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [rowHeight, setRowHeight] = useState(12);
  const header = 0;
  const timelineHeight = 110;
  const height = (high - low + 1) * rowHeight + header;
  const scale = zoom * BASE_PIXELS_PER_SECOND;
  const minZoom = minimumZoom(viewportWidth, duration);
  const step = timelineStep(scale);
  const width = Math.max(1, viewportWidth - 45, (duration || 16) * scale);
  const pitchY = (p: number) => header + (high - p) * rowHeight;
  const updateAudition = (clientY: number) => {
    const active = auditionRef.current;
    if (!active) return;
    const pitch = Math.max(low, Math.min(high,
      high - Math.floor((clientY - active.element.getBoundingClientRect().top) / rowHeight)));
    // Moving within the same row should sustain the note, not retrigger it.
    if (pitch === active.pitch) return;
    const next = { ...active, pitch };
    auditionRef.current = next;
    setAuditionPitch(pitch);
    setAuditionError("");
    const preview = previewRef.current ??= new PianoPreview();
    void preview.play(pitch).catch(() => {
      if (auditionRef.current !== next) return;
      stopAudition();
      setAuditionError("暂时无法试听，请再次按下琴键。");
    });
  };
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // Start around the melody register while keeping all 88 keys scrollable.
    el.scrollTop = Math.max(0, header + (high - 66) * rowHeight - (el.clientHeight - timelineHeight) / 2);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!viewportWidth) return;
    onMinZoomChange(minZoom);
    if (zoom < minZoom) onZoomChange(minZoom);
  }, [viewportWidth, minZoom, zoom, onZoomChange, onMinZoomChange]);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // A native non-passive listener prevents browser page zoom for this gesture.
    let requestedZoom = zoom;
    let requestedRowHeight = rowHeight;
    const wheel = (event: WheelEvent) => {
      const action = wheelAction(interactionSettings, event);
      if (action === null) return;
      event.preventDefault();
      if (action === "none") return;
      const rawDelta = event.deltaY || event.deltaX;
      const delta = rawDelta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1);
      if (action === "scroll-horizontal" || action === "scroll-vertical") {
        if (action === "scroll-horizontal") el.scrollLeft += delta;
        else el.scrollTop += delta;
        followAfterRef.current = performance.now() + 1000;
        return;
      }
      const factor = Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.003);
      if (action === "zoom-vertical") {
        // Account for the pinned waveform/ruler above the pitch rows.
        // Quantize to browser layout units so keys and SVG rows stay aligned.
        const next = Math.max(6, Math.min(48, Math.round(requestedRowHeight * factor * 64) / 64));
        if (next === requestedRowHeight) return;
        const pointerY = Math.max(0, Math.min(el.clientHeight - timelineHeight,
          event.clientY - el.getBoundingClientRect().top - timelineHeight));
        verticalZoomAnchorRef.current = zoomedScrollLeft(
          verticalZoomAnchorRef.current ?? el.scrollTop, pointerY, requestedRowHeight, next);
        requestedRowHeight = next;
        setRowHeight(next);
        return;
      }
      const next = Math.max(minZoom, Math.min(MAX_ZOOM,
        requestedZoom * factor));
      if (next === requestedZoom) return;
      const pointerX = Math.max(0, Math.min(el.clientWidth - 45,
        event.clientX - el.getBoundingClientRect().left - 45));
      zoomAnchorRef.current = zoomedScrollLeft(zoomAnchorRef.current ?? el.scrollLeft,
        pointerX, requestedZoom, next);
      requestedZoom = next;
      followAfterRef.current = performance.now() + 1000;
      onZoomChange(next);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [zoom, minZoom, onZoomChange, rowHeight, interactionSettings]);
  useLayoutEffect(() => {
    if (scrollRef.current && verticalZoomAnchorRef.current !== null) {
      scrollRef.current.scrollTop = verticalZoomAnchorRef.current;
      verticalZoomAnchorRef.current = null;
    }
  }, [rowHeight]);
  useLayoutEffect(() => {
    if (scrollRef.current && zoomAnchorRef.current !== null) {
      scrollRef.current.scrollLeft = zoomAnchorRef.current;
      zoomAnchorRef.current = null;
    }
  }, [zoom]);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || empty) return;
    const didSeek = time !== lastTimeRef.current;
    lastTimeRef.current = time;
    let frame = 0;
    const draw = () => {
      // Read the audio clock every frame; timeupdate is too sparse for animation.
      // Move only the playhead instead of rendering the entire score every frame.
      const x = (getPlaybackTime() ?? time) * scale;
      playheadRef.current?.setAttribute("transform", `translate(${x} 0)`);
      if (waveformPlayheadRef.current)
        waveformPlayheadRef.current.style.transform = `translateX(${x}px)`;
      const visibleWidth = el.clientWidth - 45;
      const rightInset = Math.min(80, visibleWidth / 4);
      const follow = !panRef.current && (playing || didSeek) && performance.now() >= followAfterRef.current;
      if (follow && x > el.scrollLeft + visibleWidth - rightInset) {
        el.scrollLeft = Math.max(0, x - visibleWidth + rightInset);
      } else if (follow && x < el.scrollLeft) {
        el.scrollLeft = Math.max(0, x - 100);
      }
      if (playing) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [time, playing, getPlaybackTime, scale, empty, viewportWidth]);
  return (
    <div
      className={`roll ${empty ? "is-placeholder" : ""}`}
      ref={scrollRef}
      tabIndex={0}
      role="region"
      aria-label="钢琴卷帘，按空格播放或暂停，左键按住音高行试听，松开停止。滚轮快捷键和中键拖拽可在设置中调整。"
      aria-keyshortcuts="Space"
      onPointerDown={(event) => {
        const el = event.currentTarget;
        el.focus({ preventScroll: true });
        if (event.button !== 1 || !interactionSettings.middleDrag) return;
        event.preventDefault();
        stopAudition();
        showSeekPreview(null);
        panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        el.setPointerCapture(event.pointerId);
        el.classList.add("is-panning");
      }}
      onPointerMove={(event) => {
        const pan = panRef.current;
        if (!pan || pan.pointerId !== event.pointerId) return;
        if (!(event.buttons & 4)) {
          stopPan();
          return;
        }
        event.preventDefault();
        const el = event.currentTarget;
        el.scrollLeft += pan.x - event.clientX;
        el.scrollTop += pan.y - event.clientY;
        pan.x = event.clientX;
        pan.y = event.clientY;
      }}
      onPointerUp={(event) => {
        if (panRef.current?.pointerId === event.pointerId) stopPan();
      }}
      onPointerCancel={stopPan}
      onLostPointerCapture={stopPan}
      onMouseDown={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
      onAuxClick={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
    >
      <div className="roll-content" style={{ width: width + 45 }}>
        <div className="timeline-header" style={{ height: timelineHeight }}>
          <div className="timeline-labels"><span>{!empty && !samples ? "MIDI" : "音频"}</span><span>音高</span></div>
          <div className="timeline-track" style={{ width }}>
            <AudioWaveform samples={samples} duration={duration} time={time}
              scale={scale} width={width} onSeek={onSeek} onHover={showSeekPreview} />
            <svg className="timeline-ruler" width={width} height={30} aria-hidden="true">
            {Array.from({ length: Math.ceil(width / (scale * step)) + 1 }, (_, i) => (
              <g key={i}>
                <line
                  x1={i * step * scale}
                  x2={i * step * scale}
                  y1={0}
                  y2={30}
                  stroke={i % 4 === 0 ? "var(--grid-major)" : "var(--line)"}
                />
                {i % 2 === 0 && (
                  <text
                    x={i * step * scale + 8}
                    y="19"
                    fontSize="10"
                    fill="var(--muted)"
                    fontFamily="monospace"
                  >
                    {Math.floor(i * step / 60)}:{String(i * step % 60).padStart(2, "0")}
                  </text>
                )}
              </g>
            ))}
            </svg>
            <div className="seek-preview-head" ref={hoverHeadRef} />
            {!empty && <div className="waveform-playhead" ref={waveformPlayheadRef} />}
          </div>
        </div>
        {auditionError && <div role="alert" className="audition-error">{auditionError}</div>}
        <div className="roll-notes" style={{ height }}
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary || panRef.current) return;
            event.preventDefault();
            stopAudition();
            const element = event.currentTarget;
            element.setPointerCapture(event.pointerId);
            auditionRef.current = { pointerId: event.pointerId, element, pitch: null };
            updateAudition(event.clientY);
          }}
          onPointerMove={(event) => {
            if (auditionRef.current?.pointerId !== event.pointerId) return;
            if (!(event.buttons & 1)) {
              stopAudition();
              return;
            }
            event.preventDefault();
            updateAudition(event.clientY);
          }}
          onPointerUp={(event) => {
            if (auditionRef.current?.pointerId === event.pointerId) stopAudition();
          }}
          onPointerCancel={stopAudition}
          onLostPointerCapture={stopAudition}
        >
        <div className="piano-keys" style={{ height }}>
          {Array.from({ length: high - low + 1 }, (_, i) => high - i).map((p) => (
            <div
              key={p}
              className={`piano-key ${auditionPitch === p ? "is-auditioning" : ""} ${[1, 3, 6, 8, 10].includes(p % 12) ? "black" : ""}`}
              style={{ height: rowHeight, lineHeight: `${rowHeight}px`, fontSize: Math.max(7, Math.min(12, rowHeight * 0.6)) }}
            >
              {p % 12 === 0 ? pitchName(p) : ""}
            </div>
          ))}
        </div>
        <div className="roll-grid">
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={
              empty
                ? "上传前的音符示意"
                : `${notes.length} 个音符，横轴时间，纵轴音高`
            }

          >
            {Array.from({ length: high - low + 1 }, (_, i) => high - i).map(
              (p) => (
                <g key={p}>
                  <rect
                    x="0"
                    y={pitchY(p)}
                    width={width}
                    height={rowHeight}
                    fill={[1, 3, 6, 8, 10].includes(p % 12) ? "var(--roll-black)" : "var(--roll-white)"}
                  />
                  <line
                    x1="0"
                    x2={width}
                    y1={pitchY(p) + rowHeight}
                    y2={pitchY(p) + rowHeight}
                    stroke="var(--line)"
                  />
                </g>
              ),
            )}
            {Array.from({ length: Math.ceil(width / (scale * step)) + 1 }, (_, i) => (
              <g key={i}>
                <line
                  x1={i * step * scale}
                  x2={i * step * scale}
                  y1={header}
                  y2={height}
                  stroke={i % 4 === 0 ? "var(--grid-major)" : "var(--line)"}
                />

              </g>
            ))}
            {!empty && processed > 0 && processed < duration && (
              <rect
                x={processed * scale}
                y={header}
                width={Math.max(0, width - processed * scale)}
                height={height - header}
                fill="var(--soft)"
                opacity="0.5"
              />
            )}
            {auditionPitch !== null && <rect x={0} y={pitchY(auditionPitch)}
              width={width} height={rowHeight} fill="var(--note)" opacity={0.18} pointerEvents="none" />}
            <line ref={hoverLineRef} className="seek-preview-line" x1={0} x2={0}
              y1={0} y2={height} stroke="var(--playhead)" strokeDasharray="5 4" pointerEvents="none" />
            {shown.map((n, i) => (
              <rect
                key={i}
                x={n.start * scale}
                y={pitchY(n.pitch) + 2}
                width={Math.max(3, n.duration * scale)}
                height={rowHeight - 3}
                fill={n.pitch < 60 ? "var(--note-low)" : "var(--note)"}
                opacity={
                  empty ? 0.45 : Math.max(0.25, Math.min(1, n.confidence * 1.7))
                }
              />
            ))}
            {!empty && (
              <g ref={playheadRef}>
                <line
                  x1={0}
                  x2={0}
                  y1={header}
                  y2={height}
                  stroke="var(--playhead)"
                  strokeWidth="1.5"
                />
                <path
                  d="M-4 0 L4 0 L0 6Z"
                  fill="var(--playhead)"
                />
              </g>
            )}
          </svg>
        </div>
        </div>
      </div>
      {empty && (
        <div className="roll-placeholder-label">
          谱面示意 · 你的旋律即将在这里出现
        </div>
      )}
    </div>
  );
}
