import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { AudioLines, Check, Download, Info, LoaderCircle, Mic, Minus, Pause, Play, Plus, RotateCcw, Settings, ShieldCheck, Square } from "lucide-react";
import PianoRoll from "./components/PianoRoll";
import WorkspaceNav from "./components/WorkspaceNav";
import SettingsDialog from "./components/SettingsDialog";
import Select from "./components/Select";
import { encodeWav, formatTime } from "./lib/audio";
import { HummingRecorder, type HummingRecording, type HummingUpdate } from "./lib/humming-recorder";
import { MidiPlayer } from "./lib/midi-player";
import { download, exportMidi, filterNotes, pitchName } from "./lib/notes";
import { readSettings, SETTINGS_KEY } from "./lib/settings";
import { MAX_ZOOM } from "./lib/timeline";
import type { Note } from "./types";
import "./humming.css";

type Phase = "idle" | "requesting" | "recording" | "stopping" | "done";
interface Recording extends HummingRecording { url: string; name: string }

export default function HummingPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [recording, setRecording] = useState<Recording | null>(null);
  const [rawNotes, setRawNotes] = useState<Note[]>([]);
  const [live, setLive] = useState<HummingUpdate | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [gateDb, setGateDb] = useState(-42);
  const [minDuration, setMinDuration] = useState(0.12);
  const [bpm, setBpm] = useState(110);
  const [bpmDraft, setBpmDraft] = useState("110");
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [source, setSource] = useState<"audio" | "midi">("audio");
  const [rate, setRate] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(0.01);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [interactionSettings, setInteractionSettings] = useState(readSettings);
  const recorderRef = useRef<HummingRecorder | null>(null);
  const recordingRef = useRef<Recording | null>(null);
  const liveRef = useRef<HummingUpdate | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const midiRef = useRef<MidiPlayer | null>(null);
  const generation = useRef(0);
  const playRequest = useRef(0);
  const active = phase === "recording" || phase === "stopping";
  const busy = active || phase === "requesting";
  const notes = useMemo(() => filterNotes(rawNotes, 0, minDuration), [rawNotes, minDuration]);
  const duration = active ? Math.max(16, Math.ceil(((live?.time || 0) + 2) / 8) * 8) : recording?.duration || 0;
  const canPlay = !!recording && !busy && (source === "audio" || notes.length > 0);

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(interactionSettings)); } catch { /* Session-only settings. */ }
  }, [interactionSettings]);
  useEffect(() => {
    if (recorderRef.current) recorderRef.current.gate = 10 ** (gateDb / 20);
  }, [gateDb]);
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
    if (!notes.length && midiRef.current?.active) {
      setTime(midiRef.current.currentTime || 0);
      midiRef.current.stop(); setPlaying(false);
    } else midiRef.current?.update(notes, rate);
  }, [rate, notes, recording]);
  useEffect(() => () => {
    generation.current++;
    playRequest.current++;
    recorderRef.current?.dispose();
    recorderRef.current = null;
    midiRef.current?.dispose();
    audioRef.current?.pause();
    if (recordingRef.current) URL.revokeObjectURL(recordingRef.current.url);
  }, []);

  function pause() {
    playRequest.current++;
    audioRef.current?.pause();
    midiRef.current?.stop();
    setPlaying(false);
  }
  async function stopRecording(message = "") {
    const recorder = recorderRef.current;
    if (!recorder) return;
    const request = generation.current;
    setPhase("stopping");
    if (message) setNotice(message);
    const result = await recorder.stop();
    if (request !== generation.current || recorderRef.current !== recorder) return;
    recorderRef.current = null;
    const name = `哼唱-${new Date().toLocaleString("sv-SE").replace(/[: ]/g, "-")}`;
    const next = { ...result, name, url: URL.createObjectURL(encodeWav(result.samples, result.sampleRate)) };
    recordingRef.current = next;
    setRecording(next); setRawNotes(result.notes); setPhase("done"); setTime(0);
    setLive(null); liveRef.current = null;
  }
  async function startRecording() {
    if (recorderRef.current) return;
    const request = ++generation.current;
    pause(); setError(""); setNotice(""); setPhase("requesting");
    let lastRender = 0;
    const recorder = new HummingRecorder((frame) => {
      if (recorderRef.current !== recorder || request !== generation.current) return;
      liveRef.current = frame;
      if (frame.time - lastRender < 0.06) return;
      lastRender = frame.time;
      setLive(frame); setRawNotes(frame.notes); setTime(frame.time);
    }, (reason) => {
      if (recorderRef.current === recorder && request === generation.current) void stopRecording(reason);
    });
    recorder.gate = 10 ** (gateDb / 20);
    recorderRef.current = recorder;
    try {
      if (!await recorder.start() || request !== generation.current) return;
      if (recordingRef.current) URL.revokeObjectURL(recordingRef.current.url);
      recordingRef.current = null; setRecording(null);
      setRawNotes([]); setTime(0); setLive(null); liveRef.current = null;
      setSource("audio"); setZoom(1); setPhase("recording");
    } catch (error) {
      if (request !== generation.current) return;
      recorderRef.current = null;
      setPhase(recordingRef.current ? "done" : "idle");
      setError(error instanceof Error ? error.message : "录音启动失败，请检查麦克风后重试。");
    }
  }
  function cancelRequest() {
    generation.current++;
    recorderRef.current?.dispose(); recorderRef.current = null;
    setPhase(recordingRef.current ? "done" : "idle");
  }
  const getPlaybackTime = useCallback(() => active ? liveRef.current?.time
    : source === "midi" ? midiRef.current?.currentTime : audioRef.current?.currentTime, [active, source]);
  function seek(position: number) {
    if (!recording || busy) return;
    const next = Math.max(0, Math.min(recording.duration, position));
    if (source === "midi") midiRef.current?.seek(next);
    else if (audioRef.current) audioRef.current.currentTime = next;
    setTime(next);
  }
  function switchSource(next: typeof source) {
    if (next === source) return;
    const position = getPlaybackTime() ?? time;
    pause(); setSource(next); setTime(position);
    if (next === "audio" && audioRef.current) audioRef.current.currentTime = position;
  }
  async function togglePlay() {
    if (!canPlay || !recording) return;
    const position = getPlaybackTime() ?? time;
    if (playing) { pause(); setTime(position); return; }
    const request = ++playRequest.current;
    try {
      const start = time >= recording.duration ? 0 : time;
      if (source === "midi") {
        const player = midiRef.current ??= new MidiPlayer((position, ended) => {
          setTime(position); if (ended) setPlaying(false);
        });
        const started = await player.play(notes, start, rate, recording.duration);
        if (started && request === playRequest.current) setPlaying(true);
      } else if (audioRef.current) {
        audioRef.current.currentTime = start;
        await audioRef.current.play();
        if (request === playRequest.current) setPlaying(true);
      }
    } catch {
      if (request === playRequest.current) setError("暂时无法播放，请再次点击播放。");
    }
  }
  const shortcut = useEffectEvent(() => void togglePlay());
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (settingsOpen || event.code !== "Space" || event.repeat || (event.target instanceof Element && event.target.closest('input, textarea, select, button, a, [role="combobox"], [contenteditable="true"]'))) return;
      event.preventDefault(); shortcut();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);
  async function saveMidi() {
    if (!recording || busy || !notes.length) return;
    try { await exportMidi(notes, bpm, recording.name); }
    catch { setError("MIDI 导出失败，请重试。"); }
  }
  const pitch = active ? live?.pitch : null;
  const meter = active && live ? Math.max(0, Math.min(100, (20 * Math.log10(Math.max(0.0001, live.rms)) + 60) / 60 * 100)) : 0;
  const status = phase === "requesting" ? "等待麦克风权限…" : phase === "stopping" ? "正在保存录音…" : phase === "recording" ? "正在录音 · 边哼边出谱" : recording ? "录音完成 · 可以回听与导出" : "准备好了，就哼一段旋律";

  return <div className="app-shell humming-page">
    <header className="topbar">
      <a className="brand" href="#/" aria-label="听谱首页"><span className="brand-icon"><AudioLines size={24} /></span><span>听谱 <small>HEARSCORE</small></span></a>
      <WorkspaceNav mode="humming" />
      <div className="header-right"><span className="local-badge"><span />浏览器内处理</span><button className="help-button" aria-haspopup="dialog" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(true)}><Settings size={16} />设置</button></div>
    </header>
    <main><div className="workspace">
      <aside className="sidebar">
        <section className="panel humming-record-panel">
          <div className="humming-eyebrow"><Mic size={16} /> HUM TO SCORE</div>
          <h1>哼唱出谱</h1>
          <p className="humming-description">把脑海里的旋律，哼成看得见的音符。</p>
          <div className={`humming-mic ${active ? "is-recording" : ""}`}><Mic size={30} /></div>
          <p className="humming-status" role="status">{status}</p>
          <div className="humming-clock">{formatTime(active ? live?.time || 0 : recording?.duration || 0)} <span>/ 05:00</span></div>
          {phase === "requesting" ? <button className="humming-record-button" onClick={cancelRequest}><LoaderCircle className="spin" size={17} />取消等待</button>
            : active ? <button className="humming-record-button is-recording" disabled={phase === "stopping"} onClick={() => void stopRecording()}><Square size={15} fill="currentColor" />{phase === "stopping" ? "正在保存…" : "停止录音"}</button>
            : <button className="humming-record-button" onClick={() => void startRecording()}>{recording ? <RotateCcw size={17} /> : <Mic size={17} />}{recording ? "重新录音" : "开始录音"}</button>}
          <p className="humming-caption">{recording && !busy ? "重新录音会替换当前结果，请先导出需要的内容。" : "允许使用麦克风后，直接哼唱即可。"}</p>
          <div className="humming-input-level"><span>麦克风音量</span><span>{active ? (live?.rms || 0) >= 0.85 ? "音量过大" : live?.rms && live.rms >= 10 ** (gateDb / 20) ? "收到声音" : "等待声音" : "未录音"}</span></div>
          <div className="humming-meter" role="meter" aria-label="麦克风输入音量" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(meter)}><i style={{ width: `${meter}%` }} /></div>
          <div className="humming-privacy"><ShieldCheck size={15} /><span>录音与识别留在设备，不上传服务器</span></div>
        </section>
        <section className="panel humming-settings">
          <h2>调整谱面</h2>
          <label className="setting-label" htmlFor="humming-gate">收音门限 <span>{gateDb} dB</span></label>
          <input id="humming-gate" type="range" min={-60} max={-24} step={3} value={gateDb} onChange={(event) => setGateDb(Number(event.target.value))} />
          <div className="range-labels"><span>轻声也能识别</span><span>减少环境杂音</span></div>
          <p className="humming-caption">录音时生效；安静哼唱却没有音符时，可向左调低。</p>
          <label className="setting-label duration-label" htmlFor="humming-duration">最短音符 <span>{Math.round(minDuration * 1000)} ms</span></label>
          <input id="humming-duration" type="range" min={0.06} max={0.4} step={0.02} value={minDuration} onChange={(event) => setMinDuration(Number(event.target.value))} />
          <div className="range-labels"><span>保留短音</span><span>减少碎音</span></div>
          <div className="tempo-setting"><div><label htmlFor="humming-bpm">导出速度</label><small>手动设置 · 保留实际时序</small></div><div className="bpm-input"><input id="humming-bpm" type="number" min={40} max={240} value={bpmDraft} onChange={(event) => setBpmDraft(event.target.value)} onBlur={() => {
            const value = Math.round(Number(bpmDraft));
            const next = Math.max(40, Math.min(240, Number.isFinite(value) && value > 0 ? value : 110));
            setBpm(next); setBpmDraft(String(next));
          }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><span>BPM</span></div></div>
        </section>
        <div className="humming-tip"><Info size={17} /><p>一次哼一条旋律，尽量保持声音清晰、稳定。避免同时播放伴奏；换气会形成音符间隔。滑音、颤音和嘈杂环境可能造成错音，停止后可回听校对。</p></div>
      </aside>
      <section className="main-column">
        <section className="panel score-panel unified-score humming-score">
          <div className="humming-score-heading"><div><h2>你的哼唱，正在成谱</h2><p>实时音高识别 · 钢琴卷帘窗</p></div><span className={`status-pill ${active ? "working" : ""}`}>{active ? <Mic size={14} /> : recording ? <Check size={14} /> : <AudioLines size={14} />}{active ? "实时识别" : recording ? "已完成" : "等待录音"}</span></div>
          <div className="humming-live-strip"><div><span>当前音高</span><strong>{pitch ? pitchName(pitch.pitch) : "—"}</strong></div><div><span>频率</span><strong>{pitch ? `${Math.round(pitch.frequency)} Hz` : "—"}</strong></div><div><span>音高偏差</span><strong>{pitch ? `${pitch.cents >= 0 ? "+" : ""}${Math.round(pitch.cents)} 音分` : "—"}</strong></div><div><span>已生成</span><strong>{notes.length} <small>个音符</small></strong></div></div>
          <div className="score-toolbar">
            <div className="player-controls"><button className="play-button" disabled={!canPlay} onClick={() => void togglePlay()} aria-label={playing ? "暂停哼唱播放" : "播放哼唱"}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button><span className="time-display">{formatTime(time)} <span>/ {formatTime(active ? live?.time || 0 : recording?.duration || 0)}</span></span>
              <Select label="哼唱播放音源" value={source} disabled={busy || !recording} onChange={switchSource} options={[{ value: "audio", label: "原始录音" }, { value: "midi", label: "MIDI" }]} />
              <Select label="哼唱播放速度" value={String(rate)} onChange={(value) => setRate(Number(value))} disabled={busy} options={[{ value: "0.5", label: "0.5×" }, { value: "0.75", label: "0.75×" }, { value: "1", label: "1×" }]} /></div>
            <div className="zoom-controls"><button aria-label="缩小卷帘" disabled={zoom <= minZoom} onClick={() => setZoom(Math.max(minZoom, zoom / 1.25))}><Minus size={14} /></button><span>{Math.round(zoom * 100)}%</span><button aria-label="放大卷帘" disabled={zoom >= MAX_ZOOM} onClick={() => setZoom(Math.min(MAX_ZOOM, zoom * 1.25))}><Plus size={14} /></button><button disabled={!recording || busy} onClick={() => setZoom(minZoom)}>全曲</button></div>
            <button className="export-button" disabled={!recording || busy || !notes.length} onClick={() => void saveMidi()}><Download size={15} />导出 MIDI</button>
          </div>
          {error && <div className="error-banner" role="alert"><Info size={16} /><span>{error}</span></div>}
          {notice && <div className="humming-notice" role="status"><Info size={15} />{notice}</div>}
          <PianoRoll interactionSettings={interactionSettings} notes={notes} samples={recording?.samples} duration={duration} time={time} playing={playing || active} getPlaybackTime={getPlaybackTime} processed={active ? live?.time || 0 : duration} zoom={zoom} onZoomChange={setZoom} onMinZoomChange={setMinZoom} onSeek={seek} empty={!active && !recording} auditionEnabled={!busy} seekEnabled={!busy} followPitch={active ? pitch?.pitch : undefined} timelineLabel="录音" emptyLabel="谱面示意 · 开始录音后，哼唱的音符会实时出现在这里" />
          {recording && !notes.length && !busy && <div className="no-notes">{rawNotes.length ? "当前过滤条件下没有音符，可降低最短音符时长。" : "没有识别到稳定音高。可回听录音，调低收音门限后重新哼唱。"}</div>}
          <div className="humming-score-footer"><span>{active ? "正在跟随录音 · 停止后可回听、试听琴键与导出" : "点击时间轴定位 · 空格播放 / 暂停 · 按住音高行试听"}</span><button disabled={!recording || busy} onClick={() => recording && download(encodeWav(recording.samples, recording.sampleRate), "audio/wav", `${recording.name}.wav`)}><Download size={14} />保存录音</button></div>
        </section>
      </section>
    </div></main>
    <audio ref={audioRef} src={recording?.url} preload="auto" onTimeUpdate={(event) => { if (source === "audio") setTime(event.currentTarget.currentTime); }} onEnded={() => { if (source === "audio") { setPlaying(false); setTime(recording?.duration || 0); } }} onPause={() => { if (source === "audio") setPlaying(false); }} onError={() => { if (recordingRef.current) { setPlaying(false); setError("录音回放失败，请重新录音。"); } }} />
    <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={interactionSettings} onChange={setInteractionSettings} />
  </div>;
}
