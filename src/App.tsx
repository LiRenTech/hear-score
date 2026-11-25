import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Github,
  Settings,
  Upload,
  ArrowUpRight,
  Play,
  Pause,
  Download,
  SlidersHorizontal,
  ShieldCheck,
  Headphones,
  Sparkles,
  Info,
  X,
  RotateCcw,
  ChevronDown,
  Square,
  Check,
  LoaderCircle,
  FileAudio,
  Minus,
  Plus,
} from "lucide-react";
import type { AudioTrack, Note, Phase, Track, WorkerMessage } from "./types";
import { decodeFile, demoFile, formatTime } from "./lib/audio";
import { readMidi } from "./lib/midi";
import { MidiPlayer } from "./lib/midi-player";
import { download, exportMidi, filterNotes } from "./lib/notes";
import Select from "./components/Select";
import SettingsDialog from "./components/SettingsDialog";
import { readSettings, SETTINGS_KEY } from "./lib/settings";
import PianoRoll from "./components/PianoRoll";
import WorkspaceNav from "./components/WorkspaceNav";
import { MAX_ZOOM } from "./lib/timeline";
export default function App() {
  const [track, setTrack] = useState<Track | null>(null);
  const [rawNotes, setRawNotes] = useState<Note[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("等待一段旋律");
  const [progress, setProgress] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [error, setError] = useState("");
  const [threshold, setThreshold] = useState(0.3);
  const [minDuration, setMinDuration] = useState(0.12);
  const [bpm, setBpm] = useState(110);
  const [bpmDraft, setBpmDraft] = useState("110");
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [source, setSource] = useState<"audio" | "midi">("audio");
  const [rate, setRate] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(0.01);
  const [dragging, setDragging] = useState(false);
  const [help, setHelp] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [interactionSettings, setInteractionSettings] = useState(readSettings);
  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(interactionSettings)); } catch { /* Keep session settings if storage is unavailable. */ }
  }, [interactionSettings]);
  const [exportOpen, setExportOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const midiRef = useRef<MidiPlayer | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef(0);
  const trackRef = useRef<Track | null>(null);
  const busy = ["decoding", "loading", "analyzing"].includes(phase);
  const notes = useMemo(
    () => track?.kind === "midi" ? track.notes : filterNotes(rawNotes, threshold, minDuration),
    [track, rawNotes, threshold, minDuration],
  );
  const canPlay = !!track && (source === "audio" || notes.length > 0);
  useEffect(
    () => () => {
      requestRef.current++;
      workerRef.current?.terminate();
      if (trackRef.current?.kind === "audio") URL.revokeObjectURL(trackRef.current.url);
      midiRef.current?.dispose();
      midiRef.current = null;
    },
    [],
  );
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate, track]);
  useEffect(() => {
    const midi = midiRef.current;
    if (midi?.active && !notes.length) {
      setTime(midi.currentTime ?? 0);
      midi.stop();
      setPlaying(false);
    } else {
      midi?.update(notes, rate);
    }
  }, [rate, notes]);
  function startAnalysis(current: AudioTrack) {
    workerRef.current?.terminate();
    setRawNotes([]);
    setProcessed(0);
    setProgress(0);
    setError("");
    setPhase("loading");
    setStatus("正在加载本地识谱模型…");
    const worker = new Worker(
      new URL("./transcribe.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (workerRef.current !== worker) return;
      const message = event.data;
      if (message.type === "status") setStatus(message.text);
      if (message.type === "result") {
        setRawNotes(message.notes);
        setProgress(message.progress);
        setProcessed(message.processed);
        setPhase(message.done ? "done" : "analyzing");
        if (message.done) {
          setStatus("转录完成");
          worker.terminate();
          workerRef.current = null;
        }
      }
      if (message.type === "error") {
        setError(message.message);
        setPhase("error");
        worker.terminate();
        workerRef.current = null;
      }
    };
    worker.onerror = () => {
      if (workerRef.current !== worker) return;
      setError(
        "识谱线程启动失败。请刷新页面，或使用较新的 Chrome / Edge 浏览器。",
      );
      setPhase("error");
      worker.terminate();
      workerRef.current = null;
    };
    const copy = current.samples.slice();
    worker.postMessage(
      {
        samples: copy,
        baseUrl: new URL(import.meta.env.BASE_URL, window.location.href).href,
      },
      [copy.buffer],
    );
  }
  async function loadFile(file: File, demo = false) {
    const request = ++requestRef.current;
    const isMidi = /\.midi?$/i.test(file.name);
    workerRef.current?.terminate();
    workerRef.current = null;
    audioRef.current?.pause();
    midiRef.current?.stop();
    setSource(isMidi ? "midi" : "audio");
    setPlaying(false);
    setTime(0);
    setError("");
    setRawNotes([]);
    setProgress(0);
    setProcessed(0);
    setPhase("decoding");
    setStatus(isMidi ? "正在读取 MIDI…" : "正在读取音频…");
    if (trackRef.current?.kind === "audio") URL.revokeObjectURL(trackRef.current.url);
    trackRef.current = null;
    setTrack(null);
    try {
      const decoded = await (isMidi ? readMidi(file) : decodeFile(file));
      if (requestRef.current !== request) {
        if (decoded.kind === "audio") URL.revokeObjectURL(decoded.url);
        return;
      }
      if (decoded.kind === "audio") decoded.demo = demo;
      trackRef.current = decoded;
      setTrack(decoded);
      if (decoded.kind === "audio") startAnalysis(decoded);
      else setPhase("idle");
    } catch (e) {
      if (requestRef.current === request) {
        setError(e instanceof Error ? e.message : "音频读取失败");
        setPhase("error");
      }
    }
  }
  function cancel() {
    requestRef.current++;
    workerRef.current?.terminate();
    workerRef.current = null;
    setPhase("cancelled");
    setStatus("已停止 · 已生成的片段仍可查看");
  }
  const getPlaybackTime = useCallback(() => source === "midi"
    ? midiRef.current?.currentTime
    : audioRef.current?.currentTime, [source]);
  function seek(value: number) {
    if (!track) return;
    if (source === "midi") midiRef.current?.seek(value);
    else if (audioRef.current) audioRef.current.currentTime = value;
    setTime(value);
  }
  function switchSource(next: typeof source) {
    if (next === source) return;
    const position = getPlaybackTime() ?? time;
    midiRef.current?.stop();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      if (next === "audio") audio.currentTime = position;
    }
    setPlaying(false);
    setTime(position);
    setSource(next);
  }
  const togglePlay = useCallback(async () => {
    if (!track || !canPlay) return;
    const request = requestRef.current;
    if (source === "midi") {
      const midi = midiRef.current ??= new MidiPlayer((position, ended) => {
        setTime(ended ? position : Math.floor(position));
        if (ended) setPlaying(false);
      });
      if (midi.active) {
        setTime(midi.currentTime ?? time);
        midi.stop();
        setPlaying(false);
        return;
      }
      try {
        const position = time >= track.duration ? 0 : time;
        if (await midi.play(notes, position, rate, track.duration)) setPlaying(true);
      } catch {
        if (request === requestRef.current) setError("浏览器未能播放 MIDI，请再次点击播放。");
      }
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (audio.ended) {
      audio.currentTime = 0;
      setTime(0);
    }
    try {
      await audio.play();
    } catch (error) {
      if (request === requestRef.current && !(error instanceof DOMException && error.name === "AbortError"))
        setError("浏览器未能播放该音频，请再次点击播放或更换文件。");
    }
  }, [canPlay, notes, rate, source, time, track]);
  const togglePlayShortcut = useEffectEvent(() => void togglePlay());
  useEffect(() => {
    const restoreFocusOutline = () => document.documentElement.removeAttribute("data-playback-shortcut");
    const handleSpace = (event: KeyboardEvent) => {
      if (settingsOpen || help || (event.target instanceof Element && event.target.closest('[role="combobox"]'))) return;
      if (event.code !== "Space" && event.key !== " ") {
        if (event.type === "keydown") restoreFocusOutline();
        return;
      }
      // Playback shortcuts should not draw a focus ring around the last clicked area.
      document.documentElement.setAttribute("data-playback-shortcut", "");
      // Capture both phases of the key press before native buttons or scrolling.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === "keydown" && !event.repeat) togglePlayShortcut();
    };
    window.addEventListener("keydown", handleSpace, true);
    window.addEventListener("keyup", handleSpace, true);
    window.addEventListener("pointerdown", restoreFocusOutline, true);
    return () => {
      window.removeEventListener("keydown", handleSpace, true);
      window.removeEventListener("keyup", handleSpace, true);
      window.removeEventListener("pointerdown", restoreFocusOutline, true);
      restoreFocusOutline();
    };
  }, [settingsOpen, help]);
  const filePicker = () => inputRef.current?.click();
  const exportResult = async (kind: "midi" | "json") => {
    setExportOpen(false);
    if (track?.kind !== "audio" || !notes.length) return;
    try {
      const suffix = phase === "done" ? "" : "-部分转录";
      if (kind === "midi")
        await exportMidi(
          notes,
          bpm,
          `${track.name.replace(/\.[^.]+$/, "")}${suffix}`,
        );
      else
        download(
          JSON.stringify(
            {
              version: 1,
              name: track.name,
              complete: phase === "done",
              duration: track.duration,
              processed,
              bpm,
              bpmSource: "manual",
              filter: {
                minimumStrength: threshold,
                minimumDurationSeconds: minDuration,
              },
              strengthMeaning: "model activation, not calibrated probability",
              notes,
            },
            null,
            2,
          ),
          "application/json",
          `${track.name}${suffix}.json`,
        );
    } catch {
      setError("导出失败，请稍后重试。");
    }
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="听谱首页">
          <span className="brand-icon">
            <AudioLines size={24} />
          </span>
          <span>
            听谱 <small>HEARSCORE</small>
          </span>
        </a>
        <WorkspaceNav />
        <div className="header-right">
          <a className="help-button github-link" href="https://github.com/LiRenTech/hear-score"
            target="_blank" rel="noopener noreferrer" aria-label="在 GitHub 查看听谱源代码（新窗口打开）">
            <Github size={16} aria-hidden="true" /><span>GitHub</span>
          </a>
          <span className="local-badge">
            <span /> 浏览器内处理
          </span>
          <button className="help-button" onClick={() => setHelp(true)}>
            <Info size={15} /> 使用指南
          </button>
          <span className="version">BETA 0.1</span>
          <button className="help-button" aria-haspopup="dialog" aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(true)}><Settings size={16} />设置</button>
        </div>
      </header>
      <main>
        <div className="workspace">
          <aside className="sidebar">
            <section className="panel product-intro" aria-labelledby="product-title">
              <h1 id="product-title">在线 AI 扒谱与音频转 MIDI</h1>
              <p>听谱 Hearscore 免费在浏览器本地识别 MP3、WAV 音符，支持钢琴卷帘、原音变速播放和 MIDI / JSON 导出。</p>
              <details>
                <summary>使用步骤与识别范围</summary>
                <ol>
                  <li>导入最长 5 分钟、最大 50 MB 的音频。</li>
                  <li>等待识别，播放原音并调整音符过滤条件。</li>
                  <li>导出 MIDI，在音乐软件中继续编辑。</li>
                </ol>
                <p>音频不上传服务器。更适合清晰独奏；复杂混音可能出现错音、漏音，需要人工校对。当前不支持五线谱、MusicXML 或 PDF 导出。</p>
              </details>
            </section>
            <section
              className={`panel upload-panel ${dragging ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files[0];
                if (file) void loadFile(file);
              }}
            >
              <div className="section-label">
                <span className="step-number">01</span> 导入声音{" "}
                <span className="tiny-tag">本地文件</span>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.mid,.midi"
                className="visually-hidden"
                aria-label="选择音频或 MIDI 文件"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void loadFile(file);
                  e.target.value = "";
                }}
              />
              <button className="dropzone" onClick={filePicker}>
                <span className="upload-orbit">
                  <Upload size={24} />
                </span>
                <strong>{track ? "换一段新的音乐" : "把音乐拖到这里"}</strong>
                <span>或点击选择音频或 MIDI 文件</span>
                <small>MP3、WAV、MIDI · 最长 5 分钟 · 50 MB</small>
              </button>
              <button
                className="demo-button"
                disabled={busy}
                onClick={() => void loadFile(demoFile(), true)}
              >
                <span>
                  <Headphones size={15} /> 还没准备好？试试示例
                </span>
                <ArrowUpRight size={15} />
              </button>
              <div className="privacy">
                <ShieldCheck size={13} />
                <span>音频留在你的设备，不上传服务器</span>
              </div>
            </section>
            <section className="panel settings-panel">
              <div className="section-label">
                <span className="step-number">02</span> 调整谱面{" "}
                <SlidersHorizontal size={15} />
              </div>
              <label className="setting-label" htmlFor="threshold">
                音符过滤 <span>{Math.round(threshold * 100)}%</span>
              </label>
              <input
                id="threshold"
                type="range"
                min="0.15"
                max="0.75"
                step="0.05"
                value={threshold}
                disabled={track?.kind === "midi"}
                onChange={(e) => setThreshold(Number(e.target.value))}
              />
              <div className="range-labels">
                <span>保留更多</span>
                <span>只留较强音</span>
              </div>
              <label
                className="setting-label duration-label"
                htmlFor="minDuration"
              >
                最短音符 <span>{Math.round(minDuration * 1000)} ms</span>
              </label>
              <input
                id="minDuration"
                type="range"
                min="0.06"
                max="0.4"
                step="0.02"
                value={minDuration}
                disabled={track?.kind === "midi"}
                onChange={(e) => setMinDuration(Number(e.target.value))}
              />
              <div className="range-labels">
                <span>更多细节</span>
                <span>减少碎音</span>
              </div>
              <div className="tempo-setting">
                <div>
                  <label htmlFor="bpm">导出速度</label>
                  <small>手动设定 · 用于 MIDI 导出</small>
                </div>
                <div className="bpm-input">
                  <input
                    id="bpm"
                    type="number"
                    min="40"
                    max="240"
                    value={bpmDraft}
                    disabled={track?.kind === "midi"}
                    onChange={(e) => setBpmDraft(e.target.value)}
                    onBlur={() => {
                      const n = Math.round(Number(bpmDraft));
                      const next = Math.max(
                        40,
                        Math.min(240, Number.isFinite(n) && n > 0 ? n : 110),
                      );
                      setBpm(next);
                      setBpmDraft(String(next));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                  <span>BPM</span>
                </div>
              </div>
              <button
                className="reset-button"
                disabled={track?.kind === "midi"}
                onClick={() => {
                  setThreshold(0.3);
                  setMinDuration(0.12);
                  setBpm(110);
                  setBpmDraft("110");
                }}
              >
                <RotateCcw size={12} /> 恢复默认设置
              </button>
            </section>
            <div className="tip-card">
              <Sparkles size={17} />
              <div>
                <b>从一条清晰的旋律开始</b>
                <p>
                  独奏、哼唱通常更容易识别。完整歌曲也可以试试，伴奏和鼓点可能带来多余音符。
                </p>
              </div>
            </div>
          </aside>
          <div className="main-column">
            <section className="panel score-panel unified-score">
              {track?.kind === "audio" && (
                <audio
                  ref={audioRef}
                  src={track.url}
                  onPlay={() => { if (source === "audio") setPlaying(true); }}
                  onPause={() => { if (source === "audio") setPlaying(false); }}
                  onEnded={() => { if (source === "audio") setPlaying(false); }}
                  onTimeUpdate={(e) => { if (source === "audio") setTime(e.currentTarget.currentTime); }}
                />
              )}
              <div className="score-toolbar">
              <div className="track-header">
                <div className="file-symbol">
                  <FileAudio size={20} />
                </div>
                <div className="track-name">
                  <strong title={track?.name || "等待你的第一段音乐"}>{track?.name || "等待你的第一段音乐"}</strong>
                  <span>
                    {track
                      ? `${track.kind === "audio" && track.demo ? "合成示例 · " : ""}${formatTime(Math.ceil(track.duration))} · ${track.kind === "midi" ? "MIDI" : "本地音频"}`
                      : "上传后自动开始识别，也可以先体验示例"}
                  </span>
                </div>
                <span className={`status-pill ${busy ? "working" : ""}`}>
                  {busy ? (
                    <LoaderCircle size={12} className="spin" />
                  ) : phase === "done" ? (
                    <Check size={12} />
                  ) : (
                    <span className="status-dot" />
                  )}
                  {busy
                    ? phase === "decoding" ? "读取中" : "识别中"
                    : phase === "done"
                      ? "已完成"
                      : phase === "cancelled"
                        ? "已停止"
                        : phase === "error"
                          ? "请重试"
                          : "准备就绪"}
                </span>
              </div>
              <div className="player-controls">
                <button
                  className="play-button"
                  aria-label={playing ? "暂停" : "播放"}
                  disabled={!canPlay}
                  onClick={() => void togglePlay()}
                >
                  {playing ? (
                    <Pause size={16} fill="currentColor" />
                  ) : (
                    <Play size={16} fill="currentColor" />
                  )}
                </button>
                <span className="time-display">
                  {formatTime(time)}{" "}
                  <span>/ {formatTime(Math.ceil(track?.duration || 0))}</span>
                </span>
                {track?.kind === "audio" && (notes.length > 0 || source === "midi") && (
                  <div className="speed-label">
                    <Select label="播放音源" value={source} onChange={switchSource}
                      options={[{ value: "audio", label: "原音" }, { value: "midi", label: "MIDI" }]} />
                  </div>
                )}
                <div className="speed-label">
                  <Select label="播放速度" value={String(rate)} onChange={(value) => setRate(Number(value))}
                    options={[{ value: "0.5", label: "0.5×" }, { value: "0.75", label: "0.75×" }, { value: "1", label: "1.0×" }]} />
                </div>
              </div>

                  <div className="zoom-controls">
                    <button
                      aria-label="缩小"
                      onClick={() => setZoom(Math.max(minZoom, zoom / 1.25))}
                      disabled={zoom <= minZoom}
                    >
                      <Minus size={13} />
                    </button>
                    <span>{Number((zoom * 100).toFixed(1))}%</span>
                    <button
                      aria-label="放大"
                      onClick={() => setZoom(Math.min(MAX_ZOOM, zoom * 1.25))}
                      disabled={zoom >= MAX_ZOOM}
                    >
                      <Plus size={13} />
                    </button>
                    <button onClick={() => setZoom(minZoom)} disabled={!track}
                      title="显示整段音频" aria-label="显示整段音频">全曲</button>
                  </div>
                <div className="export-wrap">
                  <button
                    className="export-button"
                    disabled={track?.kind !== "audio" || !notes.length}
                    onClick={() => setExportOpen(!exportOpen)}
                  >
                    <Download size={14} /> 导出 <ChevronDown size={12} />
                  </button>
                  {exportOpen && (
                    <div className="export-menu">
                      <button onClick={() => void exportResult("midi")}>
                        MIDI 音符文件 <span>.mid</span>
                      </button>
                      <button onClick={() => void exportResult("json")}>
                        原始识别数据 <span>.json</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {error && (
                <div className="error-banner" role="alert">
                  <Info size={16} />
                  <span>{error}</span>
                  <button
                    aria-label="关闭错误提示"
                    onClick={() => setError("")}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {busy && (
                <div className="analysis-bar" aria-live="polite">
                  <LoaderCircle size={14} className="spin" />
                  <span>{status}</span>
                  <b>{Math.round(progress * 100)}%</b>
                  <button onClick={cancel}>
                    <Square size={10} /> 停止
                  </button>
                  <div
                    className="progress-line"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
              )}
              <PianoRoll
                interactionSettings={interactionSettings}
                samples={track?.kind === "audio" ? track.samples : undefined}
                notes={notes}
                duration={track?.duration || 0}
                time={time}
                playing={playing}
                getPlaybackTime={getPlaybackTime}
                processed={track?.kind === "midi" ? track.duration : processed}
                zoom={zoom}
                onZoomChange={setZoom}
                onMinZoomChange={setMinZoom}
                onSeek={seek}
                empty={!track}
              />
              {track && !notes.length && !busy && !error && (
                <div className="no-notes">
                  {phase === "cancelled" && !rawNotes.length
                    ? "已停止，还没有生成音符。重新选择音频文件即可再试。"
                    : rawNotes.length
                      ? "当前过滤条件下没有音符，试着降低过滤强度或最短时长。"
                      : "没有识别到稳定音符。试试更清晰的独奏或哼唱片段。"}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)}
        settings={interactionSettings} onChange={setInteractionSettings} />
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setHelp(false);
              if (e.key === "Tab") {
                const buttons = e.currentTarget.querySelectorAll("button");
                const first = buttons[0];
                const last = buttons[buttons.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <button
              autoFocus
              className="modal-close"
              aria-label="关闭使用指南"
              onClick={() => setHelp(false)}
            >
              <X size={20} />
            </button>
            <span className="brand-icon">
              <AudioLines size={24} />
            </span>
            <h2 id="help-title">把声音，变成第一份草稿。</h2>
            <p>
              选择或拖入音频即可自动识别。首次运行需要加载本地模型，之后每处理约
              6 秒音频就会更新谱面，耗时取决于设备性能。
            </p>
            <ol>
              <li>
                <b>看见旋律：</b>钢琴卷帘保留重叠音符，点击时间轴可以跳转原音。
              </li>
              <li>
                <b>边听边校对：</b>播放原音，放慢速度，调整过滤强度减少杂音。
              </li>
              <li>
                <b>带走灵感：</b>导出 MIDI 到你的音乐软件继续编辑，或导出 JSON
                保存识别数据。中途停止也可导出已完成的部分。
              </li>
            </ol>
            <div className="help-note">
              当前版本不做乐器分离、不自动识别速度与拍号。混音、人声、鼓声和混响可能导致错音、漏音。音符深浅表示模型响应强度，不是准确率。
            </div>
            <button className="primary-button" onClick={() => setHelp(false)}>
              开始听谱 <ArrowUpRight size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
