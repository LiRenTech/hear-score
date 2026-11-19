/** Basic Pitch 1.x framing, without tf.signal.frame's untyped Fill on WASM. */
export function frameAudio(samples: Float32Array) {
  const frameLength = 22050 * 2 - 256;
  const overlap = 30 * 256;
  const hop = frameLength - overlap;
  const padded = new Float32Array(samples.length + overlap / 2);
  padded.set(samples, overlap / 2);
  const count = Math.ceil(padded.length / hop);
  const frames = new Float32Array(count * frameLength);
  for (let i = 0; i < count; i++) {
    frames.set(
      padded.subarray(i * hop, i * hop + frameLength),
      i * frameLength,
    );
  }
  return { frames, count, frameLength };
}
