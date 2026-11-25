import { SAMPLE_RATE, encodeWav } from "./audio";

export const DRUMS = {
  kick: { label: "底鼓", pitch: 36, color: "#c98b42" },
  snare: { label: "军鼓", pitch: 38, color: "#a57ad5" },
  hihat: { label: "镲类", pitch: 42, color: "#4eaaa1" },
} as const;
export type DrumKind = keyof typeof DRUMS;
export interface DrumHit { time: number; kind: DrumKind; strength: number }
export interface DrumResult {
  samples: Float32Array;
  hits: DrumHit[];
  spectrogram: Uint8Array;
  columns: number;
  bands: number;
  duration: number;
}
export type DrumMessage =
  | { type: "progress"; progress: number }
  | { type: "result"; result: DrumResult }
  | { type: "error"; message: string };

const SIZE = 1024;
const HOP = 256;
const BINS = SIZE / 2 + 1;
const RADIUS = 15;

/** In-place radix-2 FFT; inverse includes 1/N normalization. */
export function fft(real: Float32Array, imag: Float32Array, inverse = false) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let len = 2; len <= n; len *= 2) {
    const angle = (inverse ? 2 : -2) * Math.PI / len;
    const wr = Math.cos(angle), wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let ur = 1, ui = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const vr = real[b] * ur - imag[b] * ui;
        const vi = real[b] * ui + imag[b] * ur;
        real[b] = real[a] - vr; imag[b] = imag[a] - vi;
        real[a] += vr; imag[a] += vi;
        const next = ur * wr - ui * wi;
        ui = ur * wi + ui * wr; ur = next;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { real[i] /= n; imag[i] /= n; }
}

// Quickselect avoids allocating or sorting an array for every time-frequency bin.
function median(values: Float32Array, count: number) {
  let left = 0, right = count - 1;
  const middle = count >> 1;
  while (left < right) {
    const pivot = values[(left + right) >> 1];
    let i = left, j = right;
    while (i <= j) {
      while (values[i] < pivot) i++;
      while (values[j] > pivot) j--;
      if (i <= j) { [values[i], values[j]] = [values[j], values[i]]; i++; j--; }
    }
    if (middle <= j) right = j;
    else if (middle >= i) left = i;
    else break;
  }
  return values[middle];
}

/** HPSS soft mask, centered STFT and overlap-add. All times stay on the input clock.
 * Median-filter reference: https://www.audiolabs-erlangen.de/resources/MIR/FMP/C8/C8S1_HPS.html
 * This isolates percussive energy, not a learned drum-kit stem.
 */
export function analyzeDrums(samples: Float32Array, suppression = 2, onProgress?: (p: number) => void): DrumResult {
  if (!samples.length || !samples.every(Number.isFinite)) throw new Error("音频样本无效");
  const frames = Math.ceil(samples.length / HOP) + 1;
  const output = new Float32Array(samples.length);
  const weights = new Float32Array(samples.length);
  const window = Float32Array.from({ length: SIZE }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / SIZE));
  const bands = 64, columns = Math.min(2400, frames);
  const spectrogram = new Uint8Array(columns * bands);
  const energy = Array.from({ length: 3 }, () => new Float32Array(frames));
  const scratch = new Float32Array(2 * RADIUS + 1);
  const margin = Math.max(1, Math.min(5, suppression));
  const bandForBin = Int16Array.from({ length: BINS }, (_, k) =>
    Math.max(0, Math.min(bands - 1, Math.floor(Math.log2(Math.max(40, k * SAMPLE_RATE / SIZE) / 40) / Math.log2(SAMPLE_RATE / 2 / 40) * bands))));

  // Bound working spectra to a batch plus both halos, independent of track length.
  for (let first = 0; first < frames; first += 96) {
    const end = Math.min(frames, first + 96);
    const lo = Math.max(0, first - RADIUS), hi = Math.min(frames, end + RADIUS);
    const spectra = Array.from({ length: hi - lo }, (_, index) => {
      const real = new Float32Array(SIZE), imag = new Float32Array(SIZE);
      const start = (lo + index) * HOP - SIZE / 2;
      for (let i = 0; i < SIZE; i++) real[i] = (samples[start + i] || 0) * window[i];
      fft(real, imag);
      const magnitude = Float32Array.from({ length: BINS }, (_, k) => Math.hypot(real[k], imag[k]));
      return { real, imag, magnitude };
    });
    for (let frame = first; frame < end; frame++) {
      const { real, imag, magnitude } = spectra[frame - lo];
      const col = Math.min(columns - 1, Math.floor(frame * HOP / samples.length * columns));
      for (let k = 0; k < BINS; k++) {
        let count = 0;
        for (let t = Math.max(0, frame - RADIUS); t <= Math.min(frames - 1, frame + RADIUS); t++)
          scratch[count++] = spectra[t - lo].magnitude[k];
        const harmonic = median(scratch, count);
        count = 0;
        for (let b = Math.max(0, k - RADIUS); b <= Math.min(BINS - 1, k + RADIUS); b++) scratch[count++] = magnitude[b];
        const percussive = median(scratch, count);
        const p2 = percussive * percussive, h2 = harmonic * harmonic * margin * margin;
        const mask = p2 / (p2 + h2 + 1e-16);
        real[k] *= mask; imag[k] *= mask;
        if (k > 0 && k < SIZE / 2) { real[SIZE - k] *= mask; imag[SIZE - k] *= mask; }
        const power = (magnitude[k] * mask) ** 2;
        const hz = k * SAMPLE_RATE / SIZE;
        if (hz >= 30 && hz < 150) energy[0][frame] += power;
        if (hz >= 180 && hz < 2800) energy[1][frame] += power;
        if (hz >= 4500) energy[2][frame] += power;
        const index = col * bands + bandForBin[k];
        const level = Math.max(0, Math.min(255, (20 * Math.log10(magnitude[k] * mask / SIZE + 1e-8) + 85) / 75 * 255));
        spectrogram[index] = Math.max(spectrogram[index], level);
      }
      fft(real, imag, true);
      const start = frame * HOP - SIZE / 2;
      for (let i = 0; i < SIZE; i++) {
        const index = start + i;
        if (index < 0 || index >= samples.length) continue;
        output[index] += real[i] * window[i];
        weights[index] += window[i] ** 2;
      }
    }
    onProgress?.(end / frames);
  }
  for (let i = 0; i < output.length; i++) output[i] = Math.max(-1, Math.min(1, output[i] / Math.max(1e-8, weights[i])));
  const hits = detectHits(energy, samples.length / SAMPLE_RATE);
  return { samples: output, hits, spectrogram, columns, bands, duration: samples.length / SAMPLE_RATE };
}

function detectHits(energy: Float32Array[], duration: number): DrumHit[] {
  const hits: DrumHit[] = [];
  const kinds: DrumKind[] = ["kick", "snare", "hihat"];
  energy.forEach((values, band) => {
    const flux = new Float32Array(values.length);
    let maximum = 0;
    for (let i = 0; i < values.length; i++) {
      // Positive change in amplitude, not raw energy: less bias toward loud hits.
      flux[i] = Math.max(0, Math.sqrt(values[i]) - Math.sqrt(values[Math.max(0, i - 2)]));
      maximum = Math.max(maximum, flux[i]);
    }
    if (maximum < 0.02) return;
    let last = -1;
    for (let i = 1; i < flux.length - 1; i++) {
      if (flux[i] < maximum * 0.055 || flux[i] < flux[i - 1] || flux[i] <= flux[i + 1]) continue;
      let average = 0, count = 0;
      for (let j = Math.max(0, i - 12); j <= Math.min(flux.length - 1, i + 12); j++) { average += flux[j]; count++; }
      if (flux[i] < average / count * 1.8) continue;
      // Refine the attack to the start of its rising edge; retain original timing.
      let onset = i;
      while (onset > Math.max(0, i - 3) && flux[onset - 1] > flux[i] * 0.15) onset--;
      const time = Math.max(0, (onset * HOP + HOP / 2) / SAMPLE_RATE);
      if (time >= duration || time - last < (band === 2 ? 0.065 : 0.09)) continue;
      // Classify a short attack window rather than the first noisy FFT frame.
      const attack = energy.map((envelope) => {
        let sum = 0;
        for (let j = i; j < Math.min(i + 4, envelope.length); j++) sum += envelope[j];
        return sum;
      });
      if (band === 0 && attack[0] < attack[1] * 0.7) continue;
      if (band === 1 && (attack[1] < attack[2] * 0.12 || attack[1] < attack[0] * 0.15)) continue;
      hits.push({ time, kind: kinds[band], strength: Math.min(1, Math.sqrt(flux[i] / maximum)) });
      last = time;
    }
  });
  return hits.sort((a, b) => a.time - b.time);
}

/** Deterministic mixed fixture: generated drums plus a sustained chord, processed normally. */
export function drumDemoSamples() {
  const duration = 9, samples = new Float32Array(SAMPLE_RATE * duration);
  let seed = 27;
  const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const fade = Math.min(1, t / 0.15, (duration - t) / 0.3);
    samples[i] = fade * (Math.sin(t * Math.PI * 2 * 261.63) + Math.sin(t * Math.PI * 2 * 329.63) + Math.sin(t * Math.PI * 2 * 392)) * 0.07;
  }
  for (let eighth = 0; eighth < 32; eighth++) {
    const start = Math.round((0.5 + eighth * 0.25) * SAMPLE_RATE);
    let previousNoise = 0;
    for (let i = 0; i < SAMPLE_RATE * 0.2; i++) {
      const t = i / SAMPLE_RATE, index = start + i;
      const random = noise();
      if (index >= samples.length) break;
      samples[index] += (random - previousNoise) * 0.12 * Math.exp(-t * 65);
      if (eighth % 4 === 0) samples[index] += Math.sin(2 * Math.PI * (55 * t + 3 * (1 - Math.exp(-25 * t)))) * 0.65 * Math.exp(-t * 22);
      if (eighth % 4 === 2) samples[index] += (random * 0.3 + Math.sin(2 * Math.PI * 190 * t) * 0.2) * Math.exp(-t * 30);
      previousNoise = random;
    }
  }
  return samples;
}
export function drumDemoFile() {
  return new File([encodeWav(drumDemoSamples(), SAMPLE_RATE)], "鼓与和弦-120BPM.wav", { type: "audio/wav" });
}
