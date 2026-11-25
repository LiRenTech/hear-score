import { analyzeDrums } from "./lib/drums";
self.onmessage = (event: MessageEvent<{ samples: Float32Array; suppression: number }>) => {
  try {
    const result = analyzeDrums(event.data.samples, event.data.suppression, (progress) => {
      self.postMessage({ type: "progress", progress });
    });
    self.postMessage({ type: "result", result }, { transfer: [result.samples.buffer, result.spectrogram.buffer] });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : "鼓声处理失败，请换一段音频重试。" });
  }
};
