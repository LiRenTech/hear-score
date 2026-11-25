import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { detectPitch, HummingNotes, type PitchReading } from "./humming";

function tone(frequency: number, rate = 16000, amplitude = 0.3, harmonic = false) {
  return Float32Array.from({ length: 2 ** Math.ceil(Math.log2(rate * 0.064)) }, (_, i) => {
    const phase = i / rate * frequency * 2 * Math.PI;
    return amplitude * (Math.sin(phase) + (harmonic ? 1.2 * Math.sin(2 * phase) + 0.4 * Math.sin(3 * phase) : 0));
  });
}
const reading = (midi: number): PitchReading => ({ frequency: 440 * 2 ** ((midi - 69) / 12), midi, pitch: Math.round(midi), cents: 0, clarity: 0.98 });

test("detects low/high humming pitches and harmonic-rich fundamentals at native sample rates", () => {
  for (const rate of [16000, 44100, 48000]) {
    for (const frequency of [65.41, 82.41, 130.81, 261.63, 440, 880, 1046.5]) {
      for (const harmonic of [false, true]) {
        const result = detectPitch(tone(frequency, rate, 0.3, harmonic), rate).pitch;
        assert.ok(result, `missing ${frequency} Hz at ${rate}, harmonics=${harmonic}`);
        assert.ok(Math.abs(1200 * Math.log2(result.frequency / frequency)) < 12,
          `estimated ${result.frequency} Hz for ${frequency} Hz`);
      }
    }
  }
});
test("rejects silence, DC offset, weak input and deterministic broadband noise", () => {
  let seed = 1234;
  const noise = Float32Array.from({ length: 1024 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return seed / 2147483648 * 0.3;
  });
  for (const signal of [new Float32Array(1024), new Float32Array(1024).fill(0.1), tone(220, 16000, 0.001), noise])
    assert.equal(detectPitch(signal, 16000).pitch, null);
  assert.ok(detectPitch(tone(220, 16000, 0.004), 16000, 0.001).pitch);
});
test("sustained notes appear during recording, survive a one-frame glitch and use semitone hysteresis", () => {
  const tracker = new HummingNotes();
  for (let i = 1; i <= 20; i++) tracker.push(reading(i === 10 ? 72 : i % 2 ? 69.55 : 69.2), i * 0.032, 0.032);
  const live = tracker.snapshot();
  assert.equal(live.length, 1);
  assert.equal(live[0].pitch, 69);
  assert.ok(live[0].duration > 0.5);
  assert.deepEqual(tracker.finish(), live);
});
test("stable pitch changes and a breathing gap split notes; one-frame fragments are dropped", () => {
  const tracker = new HummingNotes();
  let time = 0;
  const feed = (pitch: number | null, frames: number) => {
    for (let i = 0; i < frames; i++) tracker.push(pitch === null ? null : reading(pitch), time += 0.032, 0.032);
  };
  feed(60, 10); feed(64, 10); feed(null, 6); feed(64, 10); feed(null, 6); feed(72, 1);
  const notes = tracker.finish();
  assert.deepEqual(notes.map((note) => note.pitch), [60, 64, 64]);
  assert.ok(notes[2].start - notes[1].start - notes[1].duration > 0.15);
  for (let i = 1; i < notes.length; i++) assert.ok(notes[i - 1].start + notes[i - 1].duration <= notes[i].start);
});
test("audio worklet captures exact PCM, flushes the tail and does not monitor microphone output", () => {
  const messages: (Float32Array | string)[] = [];
  type Capture = { port: { onmessage: (event: { data: string }) => void }; process: (inputs: Float32Array[][], outputs?: Float32Array[][]) => boolean };
  let Processor: new (options: { processorOptions: { blockSize: number } }) => Capture;
  runInNewContext(readFileSync(new URL("../humming-capture.worklet.js", import.meta.url), "utf8"), {
    Float32Array,
    AudioWorkletProcessor: class { port = { postMessage: (data: Float32Array | string) => messages.push(data), onmessage: null }; },
    registerProcessor: (_name: string, processor: typeof Processor) => { Processor = processor; },
  });
  const processor = new Processor!({ processorOptions: { blockSize: 512 } });
  const input = Float32Array.from({ length: 128 }, (_, i) => i / 128);
  const output = new Float32Array(128);
  for (let i = 0; i < 5; i++) processor.process([[input]], [[output]]);
  processor.port.onmessage({ data: "stop" });
  assert.deepEqual(messages.map((message) => typeof message === "string" ? message : message.length), [512, 128, "stopped"]);
  assert.deepEqual(messages[1], input);
  assert.equal(output.some((sample) => sample !== 0), false);
  assert.equal(processor.process([[input]]), false);
});
