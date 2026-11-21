/** Preserve both polarities and every sample, including the final partial bin. */
export function waveformEnvelope(samples: Float32Array, columns: number) {
  const count = Math.max(1, Math.floor(columns));
  const low = new Float32Array(count);
  const high = new Float32Array(count);
  for (let x = 0; x < count; x++) {
    const start = Math.floor(x * samples.length / count);
    const end = Math.min(samples.length, Math.max(start + 1, Math.floor((x + 1) * samples.length / count)));
    for (let i = start; i < end; i++) {
      low[x] = Math.min(low[x], samples[i]);
      high[x] = Math.max(high[x], samples[i]);
    }
  }
  return { low, high };
}
