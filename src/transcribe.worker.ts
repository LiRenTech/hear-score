import * as tf from "@tensorflow/tfjs";
import { setWasmPaths } from "@tensorflow/tfjs-backend-wasm";
import {
  BasicPitch,
  noteFramesToTime,
  outputToNotesPoly,
} from "@spotify/basic-pitch";
import { frameAudio } from "./lib/framing";
import { joinChunks } from "./lib/transcription";
import type { Note, WorkerMessage } from "./types";
class BrowserBasicPitch extends BasicPitch {
  override async prepareData(
    samples: Float32Array,
  ): Promise<[tf.Tensor3D, number]> {
    // TFJS 3.x signal.frame pads with Fill(dtype=undefined), which breaks WASM.
    // Keep Spotify's exact frame size, overlap and zero-padding, using typed PCM.
    const { frames, count, frameLength } = frameAudio(samples);
    return [
      tf.tensor3d(frames, [count, frameLength, 1], "float32"),
      samples.length,
    ];
  }
}
const send = (message: WorkerMessage) => self.postMessage(message);
self.onmessage = async (
  event: MessageEvent<{ samples: Float32Array; baseUrl: string }>,
) => {
  try {
    const { samples, baseUrl } = event.data;
    send({ type: "status", text: "正在加载本地识谱模型…" });
    setWasmPaths(new URL("wasm/", baseUrl).href);
    try {
      if (!(await tf.setBackend("wasm"))) throw new Error("WASM unavailable");
    } catch {
      await tf.setBackend("cpu");
    }
    await tf.ready();
    const model = new BrowserBasicPitch(
      new URL("model/model.json", baseUrl).href,
    );
    await model.model;
    const rate = 22050;
    const duration = samples.length / rate;
    const chunkSize = 6;
    let notes: Note[] = [];
    for (let start = 0; start < duration; start += chunkSize) {
      const end = Math.min(duration, start + chunkSize);
      const contextStart = Math.max(0, start - 0.5);
      const contextEnd = Math.min(duration, end + 0.5);
      const chunk = samples.slice(
        Math.floor(contextStart * rate),
        Math.ceil(contextEnd * rate),
      );
      const evaluate = async () => {
        const frames: number[][] = [];
        const onsets: number[][] = [];
        // Basic Pitch 1.x leaves intermediate tensors alive; bound them to one audio chunk.
        tf.engine().startScope();
        try {
          await model.evaluateModel(
            chunk,
            (f, o) => {
              frames.push(...f);
              onsets.push(...o);
            },
            () => {},
          );
        } finally {
          tf.engine().endScope();
        }
        return frames.length > 3
          ? noteFramesToTime(outputToNotesPoly(frames, onsets, 0.25, 0.2, 5))
          : [];
      };
      send({
        type: "status",
        text: `正在聆听 ${Math.floor(start)}–${Math.ceil(end)} 秒…`,
      });
      let events;
      try {
        events = await evaluate();
      } catch (error) {
        if (tf.getBackend() !== "wasm") throw error;
        send({ type: "status", text: "正在切换到兼容计算模式…" });
        await tf.setBackend("cpu");
        events = await evaluate();
      }
      const next: Note[] = events
        .map((n) => {
          const noteStart = Math.max(start, n.startTimeSeconds + contextStart);
          const noteEnd = Math.min(
            end,
            n.startTimeSeconds + contextStart + n.durationSeconds,
          );
          return {
            pitch: n.pitchMidi,
            start: noteStart,
            duration: noteEnd - noteStart,
            confidence: n.amplitude,
          };
        })
        .filter((n) => n.duration > 0.025 && Number.isFinite(n.confidence));
      notes = joinChunks(notes, next, start);
      send({
        type: "result",
        notes,
        progress: end / duration,
        processed: end,
        done: end >= duration,
      });
    }
    (await model.model).dispose();
  } catch (error) {
    send({
      type: "error",
      message: `识谱没有完成：${error instanceof Error ? error.message : String(error)}。可以重新分析，或换一段更短的音频。`,
    });
  }
};
