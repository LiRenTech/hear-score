import type { AudioTrack } from "../types";
export const SAMPLE_RATE = 22050;
export const MAX_SECONDS = 300;
export async function decodeFile(file: File): Promise<AudioTrack> {
  if (file.size > 50 * 1024 * 1024)
    throw new Error("文件超过 50 MB。请先裁剪音频，再试一次。");
  if (file.size === 0) throw new Error("这个文件是空的，请选择有效音频。");
  const context = new AudioContext();
  let buffer: AudioBuffer;
  try {
    buffer = await context.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error("无法解码这个文件。请尝试 MP3 或 WAV 格式的音频。");
  } finally {
    await context.close();
  }
  if (buffer.duration > MAX_SECONDS)
    throw new Error("第一版支持最长 5 分钟。请先裁剪需要扒谱的片段。");
  if (buffer.duration < 0.15)
    throw new Error("音频太短，请选择至少 0.15 秒的片段。");
  const offline = new OfflineAudioContext(
    1,
    Math.ceil(buffer.duration * SAMPLE_RATE),
    SAMPLE_RATE,
  );
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const mono = await offline.startRendering();
  const samples = mono.getChannelData(0).slice();
  return {
    kind: "audio",
    name: file.name,
    duration: buffer.duration,
    samples,
    url: URL.createObjectURL(file),
    demo: false,
  };
}
export function encodeWav(samples: Float32Array, rate: number): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const str = (offset: number, text: string) =>
    [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) =>
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 32767, true),
  );
  return new Blob([bytes], { type: "audio/wav" });
}
export function demoFile(): File {
  const melody = [
    60, 64, 67, 72, 71, 67, 64, 62, 65, 69, 72, 74, 72, 67, 64, 60,
  ];
  const samples = new Float32Array(SAMPLE_RATE * 10);
  melody.forEach((pitch, index) => {
    const start = (0.35 + index * 0.55) * SAMPLE_RATE;
    const freq = 440 * 2 ** ((pitch - 69) / 12);
    for (let i = 0; i < SAMPLE_RATE * 0.5; i++) {
      const t = i / SAMPLE_RATE;
      const envelope =
        Math.min(1, t / 0.012) *
        Math.exp(-t * 3) *
        Math.min(1, (0.5 - t) / 0.08);
      samples[Math.floor(start + i)] +=
        envelope *
        (Math.sin(2 * Math.PI * freq * t) * 0.4 +
          Math.sin(4 * Math.PI * freq * t) * 0.09 +
          Math.sin(6 * Math.PI * freq * t) * 0.025);
    }
  });
  return new File([encodeWav(samples, SAMPLE_RATE)], "窗边的小旋律.wav", {
    type: "audio/wav",
  });
}
export function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
