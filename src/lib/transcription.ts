import type { Note } from "../types";
export function joinChunks(
  previous: Note[],
  next: Note[],
  boundary: number,
): Note[] {
  const result = previous.map((n) => ({ ...n }));
  for (const note of next) {
    const prior = result.findLast(
      (n) =>
        n.pitch === note.pitch &&
        Math.abs(n.start + n.duration - boundary) < 0.055 &&
        Math.abs(note.start - boundary) < 0.055,
    );
    if (prior) {
      prior.duration =
        Math.max(prior.start + prior.duration, note.start + note.duration) -
        prior.start;
      prior.confidence = Math.max(prior.confidence, note.confidence);
    } else result.push({ ...note });
  }
  return result.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}
