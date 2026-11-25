import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DRUMS, type DrumHit, type DrumKind, type DrumResult } from "../lib/drums";
import { waveformEnvelope } from "../lib/waveform";
import { formatTime } from "../lib/audio";
import { timelineStep } from "../lib/timeline";

const LABEL = 92;
const HEIGHT = 584;
interface Props {
  original?: Float32Array;
  result: DrumResult | null;
  hits: DrumHit[];
  duration: number;
  time: number;
  playing: boolean;
  scale: number;
  bpm: number;
  offset: number;
  getTime: () => number;
  onSeek: (time: number) => void;
  onWidth: (width: number) => void;
}
export default function DrumTimeline({ original, result, hits, duration, time, playing, scale, bpm, offset, getTime, onSeek, onWidth }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const followAfter = useRef(0);
  const [viewport, setViewport] = useState({ width: 800, left: 0 });
  const [theme, setTheme] = useState(0);
  const fullWidth = Math.max(viewport.width, LABEL + (duration || 12) * scale + 24);
  const originalWave = useMemo(() => original ? waveformEnvelope(original, Math.min(30000, original.length)) : null, [original]);
  const drumWave = useMemo(() => result ? waveformEnvelope(result.samples, Math.min(30000, result.samples.length)) : null, [result]);
  const spectrogram = useMemo(() => {
    if (!result) return null;
    const canvas = document.createElement("canvas");
    canvas.width = result.columns; canvas.height = result.bands;
    const context = canvas.getContext("2d")!;
    const pixels = context.createImageData(result.columns, result.bands);
    for (let x = 0; x < result.columns; x++) for (let y = 0; y < result.bands; y++) {
      const level = result.spectrogram[x * result.bands + y] / 255;
      const index = ((result.bands - 1 - y) * result.columns + x) * 4;
      pixels.data[index] = 55 + level * 184;
      pixels.data[index + 1] = 100 + level * 115;
      pixels.data[index + 2] = 140 - level * 30;
      pixels.data[index + 3] = level * 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
  }, [result]);
  useLayoutEffect(() => {
    const el = scrollRef.current!;
    const measure = () => {
      setViewport({ width: el.clientWidth, left: el.scrollLeft });
      onWidth(Math.max(1, el.clientWidth - LABEL));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el); measure();
    const themes = new MutationObserver(() => setTheme((v) => v + 1));
    themes.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { observer.disconnect(); themes.disconnect(); };
  }, [onWidth]);
  useLayoutEffect(() => {
    const canvas = canvasRef.current!;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = viewport.width * ratio; canvas.height = HEIGHT * ratio;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(ratio, ratio);
    const css = getComputedStyle(document.documentElement);
    const color = (name: string) => css.getPropertyValue(name).trim();
    const text = color("--text"), muted = color("--muted"), line = color("--line"), surface = color("--surface");
    ctx.fillStyle = surface; ctx.fillRect(0, 0, viewport.width, HEIGHT);
    const xFor = (seconds: number) => LABEL + seconds * scale - viewport.left;
    const start = Math.max(0, viewport.left / scale), end = (viewport.left + viewport.width - LABEL) / scale;
    const stroke = (x1: number, y1: number, x2: number, y2: number, c: string) => {
      ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    };
    ctx.save(); ctx.beginPath(); ctx.rect(LABEL, 0, viewport.width - LABEL, HEIGHT); ctx.clip();
    ctx.font = "12px ui-monospace, monospace"; ctx.fillStyle = muted;
    const step = timelineStep(scale);
    for (let t = Math.ceil(start / step) * step; t <= end; t += step) {
      const x = xFor(t); stroke(x, 25, x, HEIGHT, line); ctx.fillText(formatTime(t), x + 5, 18);
    }
    const wave = (data: ReturnType<typeof waveformEnvelope> | null, center: number, c: string) => {
      stroke(LABEL, center, viewport.width, center, line);
      if (!data || !duration) return;
      ctx.strokeStyle = c; ctx.beginPath();
      for (let x = LABEL; x < viewport.width; x++) {
        const a = Math.max(0, Math.floor((x - LABEL + viewport.left) / scale / duration * data.low.length));
        const b = Math.min(data.low.length, Math.max(a + 1, Math.ceil((x + 1 - LABEL + viewport.left) / scale / duration * data.low.length)));
        let low = 0, high = 0;
        for (let i = a; i < b; i++) { low = Math.min(low, data.low[i]); high = Math.max(high, data.high[i]); }
        ctx.moveTo(x, center - high * 29); ctx.lineTo(x, center - low * 29);
      }
      ctx.stroke();
    };
    wave(originalWave, 62, color("--wave"));
    wave(drumWave, 134, "#4eaaa1");
    ctx.fillStyle = color("--soft"); ctx.fillRect(LABEL, 176, viewport.width - LABEL, 110);
    if (spectrogram && duration) ctx.drawImage(spectrogram, xFor(0), 176, duration * scale, 110);
    ctx.fillStyle = muted; ctx.font = "11px sans-serif";
    ctx.fillText("11 kHz", LABEL + 8, 191); ctx.fillText("40 Hz", LABEL + 8, 277);
    const beat = 60 / bpm;
    // Manual 4/4 grid is a reading aid only; onset positions are never quantized.
    const stride = beat * scale < 10 ? 4 * Math.ceil(40 / (beat * scale * 4)) : 1;
    for (let b = Math.max(0, Math.ceil((start - offset) / beat / stride) * stride); offset + b * beat <= end; b += stride) {
      const x = xFor(offset + b * beat), bar = b % 4 === 0;
      stroke(x, 309, x, HEIGHT, bar ? color("--grid-major") : line);
      if (bar && beat * 4 * scale >= 28) { ctx.fillStyle = muted; ctx.fillText(String(b / 4 + 1), x + 5, 306); }
    }
    for (let i = 0; i < 5; i++) stroke(LABEL, 342 + i * 16, viewport.width, 342 + i * 16, color("--grid-major"));
    const noteY: Record<DrumKind, number> = { hihat: 334, snare: 366, kick: 398 };
    const laneY: Record<DrumKind, number> = { hihat: 466, snare: 510, kick: 554 };
    for (const y of [444, 488, 532, 576]) stroke(LABEL, y, viewport.width, y, line);
    for (const hit of hits) {
      const x = xFor(hit.time);
      if (x < LABEL - 8 || x > viewport.width + 8) continue;
      const y = noteY[hit.kind];
      ctx.globalAlpha = 0.45 + 0.55 * hit.strength;
      ctx.fillStyle = DRUMS[hit.kind].color; ctx.strokeStyle = DRUMS[hit.kind].color;
      ctx.lineWidth = 2;
      if (hit.kind === "hihat") {
        ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4);
        ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke();
      } else { ctx.beginPath(); ctx.ellipse(x, y, 6, 4, -0.35, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillRect(x - 3, laneY[hit.kind] - 12, 6, 24);
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
    }
    if (!original) {
      ctx.fillStyle = muted; ctx.font = "15px sans-serif";
      ctx.fillText("导入音频或体验示例，查看鼓声与敲击落点", LABEL + 24, 133);
    } else if (!result) {
      ctx.fillStyle = muted; ctx.font = "14px sans-serif";
      ctx.fillText("处理完成后，在这里查看提取后的鼓声和鼓谱", LABEL + 24, 232);
    }
    ctx.restore();
    ctx.fillStyle = surface; ctx.fillRect(0, 0, LABEL, HEIGHT);
    stroke(LABEL, 0, LABEL, HEIGHT, line);
    ctx.fillStyle = muted; ctx.font = "12px sans-serif";
    ctx.fillText("时间", 16, 18); ctx.fillText("原音波形", 16, 65); ctx.fillText("鼓声波形", 16, 137);
    ctx.fillText("鼓声频谱", 16, 222); ctx.fillText("高频 ↑", 16, 245);
    ctx.fillText("鼓谱落点", 16, 306);
    ctx.fillStyle = text;
    ctx.fillRect(28, 357, 5, 31); ctx.fillRect(38, 357, 5, 31);
    ctx.font = "bold 22px serif"; ctx.fillText("4", 58, 369); ctx.fillText("4", 58, 392);
    ctx.font = "12px sans-serif"; ctx.fillStyle = muted; ctx.fillText("未量化", 20, 425);
    for (const kind of ["hihat", "snare", "kick"] as DrumKind[]) {
      ctx.fillStyle = DRUMS[kind].color; ctx.fillText(kind === "hihat" ? "× 镲类" : `● ${DRUMS[kind].label}`, 16, laneY[kind] + 4);
    }
  }, [viewport, theme, originalWave, drumWave, hits, duration, scale, bpm, offset, spectrogram, original, result]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      const el = scrollRef.current, head = headRef.current;
      if (!el || !head) return;
      const position = playing ? getTime() : time;
      const x = LABEL + Math.min(duration, position) * scale;
      head.style.transform = `translateX(${x}px)`;
      head.style.display = duration && x - el.scrollLeft >= LABEL ? "block" : "none";
      if (playing && performance.now() > followAfter.current && (x > el.scrollLeft + el.clientWidth - 32 || x < el.scrollLeft + LABEL)) {
        el.scrollLeft = Math.max(0, x - LABEL - (el.clientWidth - LABEL) * 0.2);
      }
      if (playing) frame = requestAnimationFrame(update);
    };
    update(); return () => cancelAnimationFrame(frame);
  }, [playing, getTime, time, duration, scale, viewport]);
  return <div className="drum-timeline" ref={scrollRef}
    onScroll={(e) => setViewport({ width: e.currentTarget.clientWidth, left: e.currentTarget.scrollLeft })}
    onWheel={() => { followAfter.current = performance.now() + 1800; }}>
    <div className="drum-timeline-content" style={{ width: fullWidth, height: HEIGHT }}>
      <canvas ref={canvasRef} style={{ width: viewport.width, height: HEIGHT }}
        role="slider" aria-label="鼓谱与波形播放进度" aria-valuemin={0} aria-valuemax={duration}
        aria-valuenow={time} aria-valuetext={`${formatTime(time)} / ${formatTime(duration)}`} tabIndex={duration ? 0 : -1}
        onClick={(e) => {
          const x = e.clientX - e.currentTarget.getBoundingClientRect().left - LABEL;
          if (!duration || x < 0) return;
          onSeek(Math.max(0, Math.min(duration, (x + viewport.left) / scale)));
        }}
        onKeyDown={(e) => {
          const target: Record<string, number> = { ArrowLeft: time - 1, ArrowRight: time + 1, Home: 0, End: duration };
          if (duration && e.key in target) { e.preventDefault(); onSeek(Math.max(0, Math.min(duration, target[e.key]))); }
        }} />
      <div className="drum-playhead" ref={headRef} aria-hidden="true"><span /></div>
    </div>
  </div>;
}
