export interface Note {
  pitch: number;
  start: number;
  duration: number;
  confidence: number;
}
interface TrackInfo {
  name: string;
  duration: number;
}
export interface AudioTrack extends TrackInfo {
  kind: "audio";
  samples: Float32Array;
  url: string;
  demo: boolean;
}
export interface MidiTrack extends TrackInfo {
  kind: "midi";
  notes: Note[];
}
export type Track = AudioTrack | MidiTrack;
export type Phase =
  | "idle"
  | "decoding"
  | "loading"
  | "analyzing"
  | "done"
  | "cancelled"
  | "error";
export type WorkerMessage =
  | { type: "status"; text: string }
  | {
      type: "result";
      notes: Note[];
      progress: number;
      processed: number;
      done: boolean;
    }
  | { type: "error"; message: string };
