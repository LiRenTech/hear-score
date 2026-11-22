import type { MidiTrack } from "../types";
import { MAX_SECONDS } from "./audio";

type MidiModule = typeof import("@tonejs/midi");

export async function loadMidi() {
  const library = await import("@tonejs/midi") as MidiModule & { default?: MidiModule };
  return library.Midi ?? library.default!.Midi;
}

export async function readMidi(file: File): Promise<MidiTrack> {
  if (file.size > 50 * 1024 * 1024) throw new Error("MIDI 文件超过 50 MB。");
  const Midi = await loadMidi();
  let midi: InstanceType<typeof Midi>;
  try {
    midi = new Midi(await file.arrayBuffer());
  } catch {
    throw new Error("无法读取这个 MIDI 文件，请选择有效的 .mid 或 .midi 文件。");
  }
  const notes = midi.tracks.flatMap((track) => track.notes.map((note) => ({
    pitch: note.midi,
    start: note.time,
    duration: note.duration,
    confidence: note.velocity,
  }))).filter((note) => note.pitch >= 0 && note.pitch <= 127 &&
    Number.isFinite(note.start + note.duration) && note.start >= 0 && note.duration > 0);
  if (!notes.length) throw new Error("这个 MIDI 文件没有可播放的音符。");
  const duration = notes.reduce((end, note) => Math.max(end, note.start + note.duration), 0);
  if (duration > MAX_SECONDS) throw new Error("MIDI 播放支持最长 5 分钟的文件。");
  return { kind: "midi", name: file.name, duration, notes };
}
