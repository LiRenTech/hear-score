import type { Note } from "../types";
const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
export const pitchName = (pitch: number) =>
  `${NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
export function filterNotes(
  notes: Note[],
  threshold: number,
  minDuration: number,
): Note[] {
  return notes.filter(
    (n) =>
      Number.isFinite(n.start) &&
      Number.isFinite(n.duration) &&
      n.start >= 0 &&
      n.duration >= minDuration &&
      n.confidence >= threshold &&
      n.pitch >= 21 &&
      n.pitch <= 108,
  );
}
export { joinChunks } from "./transcription";
export function download(data: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportMidi(notes: Note[], bpm: number, name: string) {
  const { Midi } = await import("@tonejs/midi");
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const track = midi.addTrack();
  track.name = "Hearscore transcription";
  notes.forEach((n) =>
    track.addNote({
      midi: n.pitch,
      time: n.start,
      duration: n.duration,
      velocity: Math.max(0.15, Math.min(1, n.confidence)),
    }),
  );
  download(new Uint8Array(midi.toArray()).buffer, "audio/midi", `${name}.mid`);
}
