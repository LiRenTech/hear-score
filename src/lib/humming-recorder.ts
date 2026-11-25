import { detectPitch, HummingNotes, type PitchFrame } from "./humming";
import type { Note } from "../types";

export interface HummingUpdate extends PitchFrame { time: number; notes: Note[] }
export interface HummingRecording { samples: Float32Array; sampleRate: number; duration: number; notes: Note[] }
export const MAX_HUMMING_SECONDS = 300;

export class HummingRecorder {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private chunks: Float32Array[] = [];
  private count = 0;
  private notes = new HummingNotes();
  private disposed = false;
  private stopping: Promise<HummingRecording> | null = null;
  private flush: (() => void) | null = null;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  gate = 0.008;

  constructor(private onUpdate: (frame: HummingUpdate) => void, private onEnd: (reason: string) => void) {}

  async start() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
      throw new Error("麦克风需要 HTTPS 或 localhost 环境，请通过安全地址打开此页面。");
    // Resume within the user's click, before awaiting the permission prompt.
    const context = this.context = new AudioContext({ sampleRate: 16000 });
    try {
      await context.resume();
      if (this.disposed) return false;
      if (!context.audioWorklet) throw new Error("当前浏览器不支持实时录音，请使用新版 Chrome、Edge 或 Safari。");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      } });
      if (this.disposed) { stream.getTracks().forEach((track) => track.stop()); return false; }
      this.stream = stream;
      await context.audioWorklet.addModule(new URL("../humming-capture.worklet.js", import.meta.url));
      if (this.disposed) return false;
      const step = Math.round(context.sampleRate * 0.032);
      const windowSize = 2 ** Math.ceil(Math.log2(context.sampleRate * 0.064));
      const window = new Float32Array(windowSize);
      const node = this.node = new AudioWorkletNode(context, "hearscore-humming-capture", {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { blockSize: step },
      });
      node.port.onmessage = ({ data }: MessageEvent<Float32Array | string>) => {
        if (data === "stopped") { this.flush?.(); return; }
        if (this.disposed || !(data instanceof Float32Array)) return;
        const remaining = MAX_HUMMING_SECONDS * context.sampleRate - this.count;
        const samples = data.length > remaining ? data.slice(0, remaining) : data;
        if (!samples.length) return;
        this.chunks.push(samples);
        this.count += samples.length;
        window.copyWithin(0, samples.length);
        window.set(samples, window.length - samples.length);
        const time = this.count / context.sampleRate;
        const frame = detectPitch(window, context.sampleRate, this.gate);
        const pitch = this.count >= windowSize ? frame.pitch : null;
        this.notes.push(pitch, Math.max(0, time - windowSize / context.sampleRate / 2), samples.length / context.sampleRate);
        this.onUpdate({ ...frame, pitch, time, notes: this.notes.snapshot() });
        if (time >= MAX_HUMMING_SECONDS && !this.stopping) this.onEnd("已达到 5 分钟，录音已自动停止。");
      };
      node.onprocessorerror = () => this.onEnd("录音处理意外中断，已保留收到的声音与音符。请重试。");
      for (const track of stream.getAudioTracks()) track.onended = () => this.onEnd("麦克风已断开，已保留本次录音。");
      context.onstatechange = () => {
        if (!this.disposed && !this.stopping && context.state !== "running")
          this.onEnd("录音被浏览器暂停，已保留本次录音。请返回页面后重新开始。");
      };
      this.source = context.createMediaStreamSource(stream);
      this.source.connect(node);
      node.connect(context.destination);
      this.watchdog = setTimeout(() => this.onEnd("已达到 5 分钟，录音已自动停止。"), MAX_HUMMING_SECONDS * 1000);
      return true;
    } catch (error) {
      this.dispose();
      if (error instanceof DOMException) {
        if (error.name === "NotAllowedError") throw new Error("麦克风权限未开启。请在浏览器地址栏允许麦克风，然后重新开始录音。");
        if (error.name === "NotFoundError") throw new Error("没有找到麦克风，请连接麦克风后重试。");
        if (error.name === "NotReadableError") throw new Error("麦克风暂时无法使用，可能被其他应用占用。请检查设备后重试。");
      }
      throw error;
    }
  }

  stop(): Promise<HummingRecording> {
    return this.stopping ??= this.finish();
  }

  private async finish(): Promise<HummingRecording> {
    clearTimeout(this.watchdog);
    const sampleRate = this.context?.sampleRate || 16000;
    if (this.node && !this.disposed) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 200);
        this.flush = () => { clearTimeout(timeout); resolve(); };
        this.node!.port.postMessage("stop");
      });
    }
    this.dispose();
    const samples = new Float32Array(this.count);
    let offset = 0;
    for (const chunk of this.chunks) { samples.set(chunk, offset); offset += chunk.length; }
    this.chunks = [];
    return { samples, sampleRate, duration: samples.length / sampleRate, notes: this.notes.finish() };
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.watchdog);
    this.flush?.();
    this.flush = null;
    this.stream?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    this.stream = null;
    this.source?.disconnect();
    this.source = null;
    if (this.node) { this.node.port.onmessage = null; this.node.port.close(); this.node.disconnect(); }
    this.node = null;
    if (this.context) {
      this.context.onstatechange = null;
      if (this.context.state !== "closed") void this.context.close().catch(() => {});
    }
    this.context = null;
  }
}
