import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeDrums, drumDemoSamples, fft } from "./drums";
import { SAMPLE_RATE } from "./audio";

test("FFT round trip preserves arbitrary samples", () => {
  const input = Float32Array.from({ length: 1024 }, (_, i) => Math.sin(i * 0.17) * Math.cos(i * 0.08));
  const real = input.slice(), imag = new Float32Array(input.length);
  fft(real, imag); fft(real, imag, true);
  for (let i = 0; i < real.length; i++) assert.ok(Math.abs(real[i] - input[i]) < 1e-5);
});

test("percussive separation suppresses sustained tones and preserves impulses on the input clock", () => {
  const samples = Float32Array.from({ length: SAMPLE_RATE * 3 }, (_, i) => 0.2 * Math.sin(2 * Math.PI * 440 * i / SAMPLE_RATE));
  const index = SAMPLE_RATE;
  samples[index] += 0.7;
  const result = analyzeDrums(samples);
  let power = 0;
  for (let i = SAMPLE_RATE * 2; i < SAMPLE_RATE * 2.5; i++) power += result.samples[i] ** 2;
  const rms = Math.sqrt(power / (SAMPLE_RATE / 2));
  assert.ok(rms < 0.01, `tonal residue: ${rms}`);
  assert.ok(result.samples[index] > 0.5, "attack should survive");
  assert.equal(result.samples.length, samples.length);
  assert.ok(result.samples.every(Number.isFinite));
  assert.equal(result.spectrogram.length, result.columns * result.bands);
});

test("mixed drum fixture identifies simultaneous kit hits without moving them to a beat grid", () => {
  const result = analyzeDrums(drumDemoSamples());
  for (const [kind, count, first, interval] of [["kick", 8, 0.5, 1], ["snare", 8, 1, 1], ["hihat", 32, 0.5, 0.25]] as const) {
    const hits = result.hits.filter((hit) => hit.kind === kind && hit.strength >= 0.3);
    assert.equal(hits.length, count, kind);
    hits.forEach((hit, i) => assert.ok(Math.abs(hit.time - (first + i * interval)) < 0.035, `${kind} at ${hit.time}`));
  }
});

test("silent, short, and non-hop-aligned audio produce finite, same-length output", () => {
  for (const length of [1, 3501, SAMPLE_RATE]) {
    const result = analyzeDrums(new Float32Array(length));
    assert.equal(result.samples.length, length);
    assert.ok(result.samples.every((sample) => sample === 0));
    assert.equal(result.hits.length, 0);
    assert.ok(result.spectrogram.every((pixel) => pixel === 0));
  }
  assert.throws(() => analyzeDrums(new Float32Array([NaN])), /无效/);
});

test("chunk halos preserve attacks at processing boundaries and at the tail", () => {
  const samples = new Float32Array(SAMPLE_RATE * 4 + 17);
  const indices = [96 * 256, 192 * 256, samples.length - 1];
  for (const index of indices) samples[index] = 0.8;
  const result = analyzeDrums(samples);
  for (const index of indices) assert.ok(Math.abs(result.samples[index] - 0.8) < 0.02, `attack at ${index}`);
});
