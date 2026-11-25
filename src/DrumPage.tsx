import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { AudioLines, Check, Download, Drum, Headphones, Info, LoaderCircle, Minus, Pause, Play, Plus, RotateCcw, ShieldCheck, Square, Upload } from "lucide-react";
import type { AudioTrack } from "./types";
import { decodeFile, encodeWav, formatTime, SAMPLE_RATE } from "./lib/audio";
import { DRUMS, drumDemoFile, type DrumMessage, type DrumResult } from "./lib/drums";
import { download } from "./lib/notes";
import { loadMidi } from "./lib/midi";
import DrumTimeline from "./components/DrumTimeline";
import Select from "./components/Select";
import ThemePicker from "./components/ThemePicker";
import WorkspaceNav from "./components/WorkspaceNav";
import "./drums.css";

type Source = "original" | "drums";
function GridNumber({ label, value, max, min = 0, step = 1, onChange }: { label: string; value: number; max: number; min?: number; step?: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <input aria-label={label} type="number" min={min} max={max} step={step} value={draft}
    onChange={(e) => setDraft(e.target.value)}
    onBlur={() => {
      const parsed = Number(draft);
      const next = draft.trim() && Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : value;
      onChange(next); setDraft(String(next));
    }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}
export default function DrumPage() {
  const [track, setTrack] = useState<AudioTrack | null>(null);
  const [result, setResult] = useState<DrumResult | null>(null);
  const [drumUrl, setDrumUrl] = useState("");
  const [phase, setPhase] = useState<"idle" | "decoding" | "analyzing" | "done" | "cancelled" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [source, setSource] = useState<Source>("original");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [rate, setRate] = useState(1);
  const [suppression, setSuppression] = useState(2);
  const [appliedSuppression, setAppliedSuppression] = useState(2);
  const [threshold, setThreshold] = useState(0.3);
  const [bpm, setBpm] = useState(120);
  const [offset, setOffset] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(700);
  const inputRef = useRef<HTMLInputElement>(null);
  const originalRef = useRef<HTMLAudioElement>(null);
  const drumsRef = useRef<HTMLAudioElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef(0);
  const playRequest = useRef(0);
  const urlsRef = useRef({ original: "", drums: "" });
  const sourceRef = useRef<Source>("original");
  const timeRef = useRef(0);
  const busy = phase === "decoding" || phase === "analyzing";
  const duration = track?.duration || 0;
  const hits = useMemo(() => result?.hits.filter((hit) => hit.strength >= threshold) || [], [result, threshold]);
  const minZoom = Math.min(1, viewportWidth / (Math.max(1, duration || 12) * 96));
  const scale = Math.max(minZoom, zoom) * 96;
  const activeAudio = useCallback(() => sourceRef.current === "original" ? originalRef.current : drumsRef.current, []);
  const getTime = useCallback(() => activeAudio()?.readyState ? activeAudio()!.currentTime : timeRef.current, [activeAudio]);
  const updateTime = (position: number) => { timeRef.current = position; setTime(position); };
  const pause = () => {
    playRequest.current++;
    originalRef.current?.pause(); drumsRef.current?.pause(); setPlaying(false);
  };
  useEffect(() => () => {
    requestRef.current++; playRequest.current++;
    workerRef.current?.terminate();
    URL.revokeObjectURL(urlsRef.current.original); URL.revokeObjectURL(urlsRef.current.drums);
  }, []);
  useEffect(() => {
    for (const audio of [originalRef.current, drumsRef.current]) if (audio) audio.playbackRate = rate;
  }, [rate, track, drumUrl]);
  function clearResult() {
    URL.revokeObjectURL(urlsRef.current.drums); urlsRef.current.drums = "";
    setDrumUrl(""); setResult(null); setProgress(0);
    sourceRef.current = "original"; setSource("original");
  }
  function analyze(current: AudioTrack) {
    const position = getTime(); pause(); updateTime(position);
    workerRef.current?.terminate(); clearResult();
    if (originalRef.current) originalRef.current.currentTime = position;
    setPhase("analyzing"); setError(""); setAppliedSuppression(suppression);
    let worker: Worker;
    try { worker = new Worker(new URL("./drums.worker.ts", import.meta.url), { type: "module" }); }
    catch { setError("无法启动音频处理线程，请刷新页面重试。"); setPhase("error"); return; }
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<DrumMessage>) => {
      if (workerRef.current !== worker) return;
      const message = event.data;
      if (message.type === "progress") setProgress(message.progress);
      if (message.type === "result") {
        pause(); updateTime(getTime());
        const url = URL.createObjectURL(encodeWav(message.result.samples, SAMPLE_RATE));
        urlsRef.current.drums = url; setDrumUrl(url); setResult(message.result);
        sourceRef.current = "drums"; setSource("drums");
        setPhase("done"); setProgress(1); worker.terminate(); workerRef.current = null;
      }
      if (message.type === "error") {
        setError(message.message); setPhase("error"); worker.terminate(); workerRef.current = null;
      }
    };
    worker.onerror = () => {
      if (workerRef.current !== worker) return;
      setError("处理线程中断，请尝试更短的音频或重新提取。"); setPhase("error");
      worker.terminate(); workerRef.current = null;
    };
    const copy = current.samples.slice();
    worker.postMessage({ samples: copy, suppression }, [copy.buffer]);
  }
  async function load(file: File, demo = false) {
    const request = ++requestRef.current;
    workerRef.current?.terminate(); workerRef.current = null; pause();
    clearResult(); updateTime(0); setError(""); setTrack(null); setPhase("decoding");
    URL.revokeObjectURL(urlsRef.current.original); urlsRef.current.original = "";
    try {
      if (/\.midi?$/i.test(file.name)) throw new Error("扒鼓页面需要带声音的音频文件；MIDI 请在旋律扒谱页面打开。");
      const decoded = await decodeFile(file);
      if (request !== requestRef.current) { URL.revokeObjectURL(decoded.url); return; }
      decoded.demo = demo; urlsRef.current.original = decoded.url;
      setTrack(decoded); setOffset(demo ? 0.5 : 0); setZoom(1);
      if (demo) setBpm(120);
      analyze(decoded);
    } catch (e) {
      if (request !== requestRef.current) return;
      setError(e instanceof Error ? e.message : "音频读取失败"); setPhase("error");
    }
  }
  function cancel() {
    requestRef.current++; workerRef.current?.terminate(); workerRef.current = null;
    setPhase("cancelled"); setProgress(0);
  }
  function seek(position: number) {
    const next = Math.max(0, Math.min(duration, position));
    for (const audio of [originalRef.current, drumsRef.current]) if (audio?.readyState) audio.currentTime = next;
    updateTime(next);
  }
  async function switchSource(next: Source) {
    if (next === sourceRef.current || (next === "drums" && !result)) return;
    const position = getTime(), resume = playing;
    pause(); sourceRef.current = next; setSource(next); updateTime(position);
    const audio = activeAudio();
    if (audio) {
      audio.currentTime = position; audio.playbackRate = rate;
      if (resume) await play(audio);
    }
  }
  async function play(audio: HTMLAudioElement) {
    const request = ++playRequest.current;
    try {
      await audio.play();
      if (request === playRequest.current) setPlaying(true);
    } catch (e) {
      if (request === playRequest.current && !(e instanceof DOMException && e.name === "AbortError")) {
        setPlaying(false); setError("浏览器暂时无法播放，请再次点击播放。");
      }
    }
  }
  async function togglePlay() {
    const audio = activeAudio();
    if (!track || !audio) return;
    if (!audio.paused) { updateTime(audio.currentTime); pause(); return; }
    if (audio.ended || getTime() >= duration) seek(0);
    await play(audio);
  }
  const shortcut = useEffectEvent(() => void togglePlay());
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || (event.target instanceof Element && event.target.closest('input, textarea, select, button, a, [role="combobox"], [role="listbox"], [contenteditable="true"]'))) return;
      event.preventDefault(); shortcut();
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);
  async function exportDrumMidi() {
    if (!track || !hits.length) return;
    try {
      const Midi = await loadMidi(), midi = new Midi(); midi.header.setTempo(bpm);
      const drumTrack = midi.addTrack(); drumTrack.channel = 9; drumTrack.name = "Hearscore drums (estimated)";
      hits.forEach((hit) => drumTrack.addNote({ midi: DRUMS[hit.kind].pitch, time: hit.time, duration: Math.min(0.08, duration - hit.time), velocity: hit.strength }));
      download(new Uint8Array(midi.toArray()).buffer, "audio/midi", `${track.name.replace(/\.[^.]+$/, "")}-鼓谱.mid`);
    } catch { setError("鼓谱导出失败，请重试。"); }
  }
  const status = phase === "decoding" ? "正在读取音频…" : phase === "analyzing" ? "正在提取鼓声与检测落点…" : phase === "done" ? "处理完成 · 可切换原音对照试听" : phase === "cancelled" ? "已停止 · 可重新提取" : phase === "error" ? "处理未完成" : "等待一段带鼓点的音乐";
  return <div className="app-shell drum-page">
    <header className="topbar">
      <a className="brand" href="#/" aria-label="听谱首页"><span className="brand-icon"><AudioLines size={22} /></span><span>听谱 <small>HEARSCORE</small></span></a>
      <WorkspaceNav mode="drums" />
      <div className="header-right"><span className="local-badge"><span />浏览器内处理</span><ThemePicker /></div>
    </header>
    <main><div className="workspace drum-workspace">
      <aside className="sidebar">
        <section className="panel drum-intro">
          <div className="drum-eyebrow"><Drum size={17} /> DRUM LAB <span>实验版</span></div>
          <h1>把鼓点，单独听清。</h1>
          <p>提取打击乐声音，跟着波形与鼓谱落点，一拍一拍地扒。</p>
        </section>
        <section className={`panel drum-upload ${dragging ? "dragging" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const file = e.dataTransfer.files[0]; if (file) void load(file); }}>
          <h2>导入音频</h2>
          <input className="visually-hidden" ref={inputRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac" aria-label="选择扒鼓音频"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) void load(file); e.target.value = ""; }} />
          <button className="drum-dropzone" onClick={() => inputRef.current?.click()}><Upload size={25} /><strong>{track ? "换一段音频" : "拖入带鼓点的音乐"}</strong><span>或点击选择文件</span><small>MP3 / WAV 等 · 5 分钟内 · 50 MB</small></button>
          <button className="drum-demo" disabled={busy} onClick={() => void load(drumDemoFile(), true)}><Headphones size={17} />体验鼓与和弦示例</button>
          <p className="drum-privacy"><ShieldCheck size={14} />音频保留在设备上</p>
        </section>
        <section className="panel drum-settings">
          <h2>提取与谱面</h2>
          <label className="drum-field"><span>旋律抑制</span><Select label="旋律抑制强度" value={String(suppression)} onChange={(v) => setSuppression(Number(v))}
            options={[{ value: "1", label: "轻柔 · 保留鼓尾音" }, { value: "2", label: "均衡" }, { value: "4", label: "较强 · 减少旋律" }]} /></label>
          <button className="drum-reprocess" disabled={!track || busy} onClick={() => track && analyze(track)}><RotateCcw size={14} />{result && suppression !== appliedSuppression ? "应用新强度并重新提取" : "重新提取"}</button>
          <label className="drum-field" htmlFor="drum-threshold"><span>落点过滤 <b>{Math.round(threshold * 100)}%</b></span>
            <input id="drum-threshold" type="range" min="0.1" max="0.85" step="0.05" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} /></label>
          <div className="drum-range-labels"><span>保留弱音</span><span>只留强音</span></div>
          <div className="drum-grid-inputs">
            <label>参考速度<GridNumber label="参考速度 BPM" min={40} max={240} value={bpm} onChange={setBpm} /><small>BPM · 手动设置</small></label>
            <label>首拍位置<GridNumber label="首拍位置秒" max={duration || 300} step={0.05} value={offset} onChange={setOffset} /><small>秒 · 4/4 网格</small></label>
          </div>
          <p className="drum-caption">网格辅助数拍，落点保留实际时间，不会随 BPM 移动。</p>
        </section>
        <section className="drum-limits"><Info size={17} /><p>当前采用打击乐提取，会减弱持续旋律，但无法保证只剩架子鼓。人声、其他打击乐可能残留；底鼓、军鼓和镲类为估计分类，暂不细分通鼓、开闭镲。</p></section>
      </aside>
      <section className="main-column drum-main">
        <div className="panel drum-session">
          <div className="drum-track-heading"><div><h2 title={track?.name}>{track?.name || "架子鼓扒谱工作台"}</h2><p>{track?.demo ? "合成鼓组 + 持续和弦 · 与上传音频使用同一处理流程" : "原音 / 鼓声对照试听 · 频谱与落点同步"}</p></div><span className="drum-status">{busy ? <LoaderCircle className="spin" size={15} /> : result ? <Check size={15} /> : <Drum size={15} />}{busy ? "处理中" : result ? `${hits.length} 个落点` : "待导入"}</span></div>
          <div className="drum-controls">
            <button className="drum-play" disabled={!track} onClick={() => void togglePlay()} aria-label={playing ? "暂停鼓声播放" : "播放鼓声"}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button>
            <span className="drum-time">{formatTime(time)} <span>/ {formatTime(Math.ceil(duration))}</span></span>
            <div className="drum-source" role="group" aria-label="试听音源"><button aria-pressed={source === "original"} disabled={!track} onClick={() => void switchSource("original")}>原音</button><button aria-pressed={source === "drums"} disabled={!result} onClick={() => void switchSource("drums")}>提取鼓声</button></div>
            <Select label="鼓声播放速度" value={String(rate)} onChange={(v) => setRate(Number(v))} options={[{ value: "0.5", label: "0.5×" }, { value: "0.75", label: "0.75×" }, { value: "1", label: "1×" }]} />
            <div className="drum-zoom"><button aria-label="缩小鼓谱" disabled={zoom <= minZoom} onClick={() => setZoom(Math.max(minZoom, zoom / 1.4))}><Minus size={15} /></button><span>{Math.round(Math.max(minZoom, zoom) * 100)}%</span><button aria-label="放大鼓谱" disabled={zoom >= 4} onClick={() => setZoom(Math.min(4, zoom * 1.4))}><Plus size={15} /></button><button disabled={!track} onClick={() => setZoom(minZoom)}>全曲</button></div>
          </div>
          <div className="drum-progress" role="status"><span>{status}</span>{busy && <><b>{Math.round(progress * 100)}%</b><button onClick={cancel}><Square size={12} />停止</button></>}<i style={{ width: `${progress * 100}%` }} /></div>
        </div>
        {error && <div className="error-banner" role="alert"><Info size={17} /><span>{error}</span></div>}
        <div className="panel drum-score-panel">
          <div className="drum-score-heading"><h2>鼓谱与声音</h2><span>同一竖线 = 同一时刻</span><div className="drum-legend">{Object.entries(DRUMS).map(([key, item]) => <span key={key} style={{ color: item.color }}>{key === "hihat" ? "×" : "●"} {item.label}</span>)}</div></div>
          <DrumTimeline original={track?.samples} result={result} hits={hits} duration={duration} time={time} playing={playing} scale={scale} bpm={bpm} offset={offset} getTime={getTime} onSeek={seek} onWidth={setViewportWidth} />
          <div className="drum-score-footer"><span>点击定位 · 空格播放 / 暂停 · 横向滚动查看<br />鼓谱为未量化落点图，符头表示敲击起点，暂不标注时值。</span><div><button disabled={!result || !track} onClick={() => result && track && download(encodeWav(result.samples, SAMPLE_RATE), "audio/wav", `${track.name.replace(/\.[^.]+$/, "")}-提取鼓声.wav`)}><Download size={14} />鼓声 WAV</button><button disabled={!hits.length} onClick={() => void exportDrumMidi()}><Download size={14} />鼓谱 MIDI</button></div></div>
          {result && !hits.length && <p className="drum-no-hits">当前没有保留的鼓点。可降低落点过滤，或换一段鼓声更清晰的音频；仍可试听和下载提取结果。</p>}
        </div>
      </section>
    </div></main>
    {(["original", "drums"] as Source[]).map((kind) => <audio key={kind} ref={kind === "original" ? originalRef : drumsRef} src={(kind === "original" ? track?.url : drumUrl) || undefined} preload="auto"
      onLoadedMetadata={(e) => { e.currentTarget.currentTime = Math.min(timeRef.current, duration); e.currentTarget.playbackRate = rate; }}
      onTimeUpdate={(e) => { if (sourceRef.current === kind) updateTime(e.currentTarget.currentTime); }}
      onEnded={() => { if (sourceRef.current === kind) { setPlaying(false); updateTime(duration); } }}
      onPause={() => { if (sourceRef.current === kind) setPlaying(false); }}
      onError={() => { if (sourceRef.current === kind) { setPlaying(false); setError("音频播放失败，请更换文件重试。"); } }} />)}
  </div>;
}
