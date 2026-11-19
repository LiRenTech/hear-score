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
export function abcPitch(midi: number): string {
  const names = [
    "C",
    "^C",
    "D",
    "^D",
    "E",
    "F",
    "^F",
    "G",
    "^G",
    "A",
    "^A",
    "B",
  ];
  const octave = Math.floor(midi / 12) - 1;
  const name = names[midi % 12];
  if (octave >= 5) return name.toLowerCase() + "'".repeat(octave - 5);
  return name + ",".repeat(Math.max(0, 4 - octave));
}
/** A deliberately approximate single voice, quantized to eighth notes. MIDI retains polyphony. */
export function buildAbc(
  notes: Note[],
  bpm: number,
  startBar = 0,
  bars = 8,
): string {
  const step = 30 / bpm;
  const offset = startBar * 8;
  const cells: (number | null)[] = Array.from({ length: bars * 8 }, (_, i) => {
    const position = offset + i;
    const candidates = notes.filter(
      (n) =>
        Math.round(n.start / step) <= position &&
        Math.max(
          Math.round(n.start / step) + 1,
          Math.round((n.start + n.duration) / step),
        ) > position,
    );
    candidates.sort(
      (a, b) =>
        b.confidence + b.pitch * 0.002 - (a.confidence + a.pitch * 0.002),
    );
    return candidates[0]?.pitch ?? null;
  });
  const measures: string[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const tokens: string[] = [];
    for (let i = bar * 8; i < (bar + 1) * 8;) {
      const pitch = cells[i];
      let end = i + 1;
      while (end < (bar + 1) * 8 && cells[end] === pitch) end++;
      const length = end - i;
      const tie =
        pitch !== null &&
        end % 8 === 0 &&
        end < cells.length &&
        cells[end] === pitch
          ? "-"
          : "";
      tokens.push(
        `${pitch === null ? "z" : abcPitch(pitch)}${length === 1 ? "" : length}${tie}`,
      );
      i = end;
    }
    measures.push(tokens.join(" ") + (bar === bars - 1 ? " |]" : " |"));
  }
  return `X:1\nM:4/4\nL:1/8\nQ:1/4=${bpm}\nK:C\n%%barnumbers 1\n%%measurefirst ${startBar + 1}\n${measures.map((b, i) => b + (i % 4 === 3 ? "\n" : " ")).join("")}`;
}
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
