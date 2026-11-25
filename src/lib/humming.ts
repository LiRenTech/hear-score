import type { Note } from "../types";

export interface PitchReading {
  frequency: number;
  midi: number;
  pitch: number;
  cents: number;
  clarity: number;
}
export interface PitchFrame {
  rms: number;
  pitch: PitchReading | null;
}

// YIN's cumulative mean normalized difference rejects aperiodic breath/noise.
// A 64 ms window covers low humming notes while keeping the feedback immediate.
export function detectPitch(samples: Float32Array, sampleRate: number, gate = 0.008): PitchFrame {
  let mean = 0;
  for (const sample of samples) mean += sample;
  mean /= samples.length || 1;
  let energy = 0;
  for (const sample of samples) energy += (sample - mean) ** 2;
  const rms = Math.sqrt(energy / (samples.length || 1));
  const silent = { rms, pitch: null };
  if (rms < gate || samples.length < 8 || sampleRate <= 0) return silent;
  const half = Math.floor(samples.length / 2);
  const minLag = Math.max(2, Math.floor(sampleRate / 1050));
  const maxLag = Math.min(half - 1, Math.ceil(sampleRate / 65));
  const difference = new Float32Array(maxLag + 1);
  let sum = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let value = 0;
    for (let i = 0; i < half; i++) value += (samples[i] - samples[i + lag]) ** 2;
    sum += value;
    difference[lag] = sum > 0 ? value * lag / sum : 1;
  }
  for (let lag = minLag; lag < maxLag; lag++) {
    if (difference[lag] >= 0.15) continue;
    while (lag < maxLag && difference[lag + 1] < difference[lag]) lag++;
    if (lag >= maxLag) return silent;
    const left = difference[lag - 1], center = difference[lag], right = difference[lag + 1];
    const divisor = 2 * (2 * center - right - left);
    const period = lag + (Math.abs(divisor) > 1e-10 ? (right - left) / divisor : 0);
    const frequency = sampleRate / period;
    if (frequency < 65 || frequency > 1050) return silent;
    const midi = 69 + 12 * Math.log2(frequency / 440);
    const pitch = Math.round(midi);
    return { rms, pitch: { frequency, midi, pitch, cents: (midi - pitch) * 100, clarity: 1 - center } };
  }
  return silent;
}

interface Candidate { pitch: number; start: number; end: number; strength: number; frames: number }

export class HummingNotes {
  private complete: Note[] = [];
  private active: Note | null = null;
  private lastVoiced = 0;
  private candidate: Candidate | null = null;

  push(reading: PitchReading | null, time: number, step: number) {
    // Slight hysteresis prevents vibrato at a semitone boundary from fragmenting a note.
    const anchor = this.active?.pitch ?? this.candidate?.pitch;
    const pitch = reading && anchor !== undefined && Math.abs(reading.midi - anchor) < 0.65
      ? anchor : reading?.pitch;
    if (reading && this.active && pitch === this.active.pitch) {
      this.active.duration = Math.max(0, time - this.active.start);
      this.lastVoiced = time;
      this.candidate = null;
      return;
    }
    if (reading && pitch !== undefined) {
      if (this.candidate?.pitch === pitch) {
        this.candidate.end = time;
        this.candidate.strength += reading.clarity;
        this.candidate.frames++;
      } else {
        this.candidate = { pitch, start: Math.max(0, time - step), end: time, strength: reading.clarity, frames: 1 };
      }
      if (this.candidate.frames >= 3) {
        this.close(this.candidate.start);
        const candidate = this.candidate;
        this.active = { pitch, start: candidate.start, duration: time - candidate.start, confidence: candidate.strength / candidate.frames };
        this.lastVoiced = time;
        this.candidate = null;
      }
    } else this.candidate = null;
    if (this.active && time - this.lastVoiced >= 0.096) this.close(this.lastVoiced);
  }

  private close(end: number) {
    if (!this.active) return;
    this.active.duration = Math.max(0, Math.min(end, this.lastVoiced) - this.active.start);
    if (this.active.duration >= 0.06) this.complete.push(this.active);
    this.active = null;
  }

  snapshot(): Note[] {
    return this.active ? [...this.complete, { ...this.active }] : [...this.complete];
  }

  finish(): Note[] {
    this.close(this.lastVoiced);
    this.candidate = null;
    return this.snapshot();
  }
}
