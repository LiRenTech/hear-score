export interface Note {
  pitch: number;
  start: number;
  duration: number;
  confidence: number;
}
export interface Track {
  name: string;
  duration: number;
  samples: Float32Array;
  url: string;
  demo: boolean;
}
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
