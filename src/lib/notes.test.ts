import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { Midi } = createRequire(import.meta.url)(
  "@tonejs/midi",
) as typeof import("@tonejs/midi");
import { abcPitch, buildAbc, filterNotes, joinChunks } from "./notes";
import { encodeWav, waveform } from "./audio";
import type { Note } from "../types";
const note = (
  pitch: number,
  start: number,
  duration: number,
  confidence = 0.8,
): Note => ({ pitch, start, duration, confidence });
test("joins a sustained note crossing a processing boundary without duplicating it", () => {
  const result = joinChunks(
    [note(60, 5.5, 0.5)],
    [note(60, 6, 0.6), note(64, 6.2, 0.3)],
    6,
  );
  assert.equal(result.length, 2);
  assert.ok(Math.abs(result[0].duration - 1.1) < 1e-8);
  assert.equal(result[1].pitch, 64);
});
test("preserves repeated notes separated by silence and independent polyphony", () => {
  const result = joinChunks(
    [note(60, 5, 0.7), note(64, 5.5, 0.5)],
    [note(60, 6.1, 0.4), note(64, 6, 0.5)],
    6,
  );
  assert.equal(result.filter((n) => n.pitch === 60).length, 2);
  assert.equal(result.find((n) => n.pitch === 64)?.duration, 1);
});
test("filtering removes malformed, very short and weak detections", () => {
  const result = filterNotes(
    [
      note(60, 0, 0.3),
      note(61, 0, 0.03),
      note(62, 0, 0.4, 0.2),
      note(63, NaN, 0.5),
    ],
    0.3,
    0.12,
  );
  assert.deepEqual(
    result.map((n) => n.pitch),
    [60],
  );
});
test("ABC retains leading silence and sustained notes across bars", () => {
  const abc = buildAbc([note(60, 0.5, 4)], 120, 0, 2);
  assert.match(abc, /z2 C6-/);
  assert.match(abc, /C8/);
});
test("ABC maps accidentals and octave boundaries correctly", () => {
  assert.equal(abcPitch(60), "C");
  assert.equal(abcPitch(61), "^C");
  assert.equal(abcPitch(48), "C,");
  assert.equal(abcPitch(72), "c");
  assert.equal(abcPitch(84), "c'");
  assert.match(buildAbc([], 110), /z8/);
});
test("WAV output has valid PCM headers and bounded peaks", async () => {
  const samples = new Float32Array([0, 0.5, -0.7, 0.1]);
  const buffer = await encodeWav(samples, 22050).arrayBuffer();
  const view = new DataView(buffer);
  assert.equal(buffer.byteLength, 52);
  assert.equal(view.getUint32(24, true), 22050);
  assert.equal(view.getUint32(40, true), 8);
  assert.ok(Math.abs(waveform(samples, 2)[1] - 0.7) < 1e-6);
});
test("MIDI round trip preserves overlapping notes and absolute seconds", () => {
  const midi = new Midi();
  midi.header.setTempo(110);
  const track = midi.addTrack();
  [note(60, 1, 0.8), note(64, 1, 0.8)].forEach((n) =>
    track.addNote({
      midi: n.pitch,
      time: n.start,
      duration: n.duration,
      velocity: n.confidence,
    }),
  );
  const parsed = new Midi(midi.toArray());
  assert.equal(parsed.tracks[0].notes.length, 2);
  assert.ok(Math.abs(parsed.tracks[0].notes[0].time - 1) < 0.005);
  assert.ok(Math.abs(parsed.tracks[0].notes[0].duration - 0.8) < 0.005);
});

test("typed WASM framing exactly matches Basic Pitch CPU framing", async () => {
  const tf = createRequire(import.meta.url)(
    "@tensorflow/tfjs",
  ) as typeof import("@tensorflow/tfjs");
  const { frameAudio } = await import("./framing");
  await tf.setBackend("cpu");
  for (const length of [1, 32324, 43844, 140000]) {
    const samples = Float32Array.from({ length }, (_, i) => Math.sin(i * 0.03));
    const actual = frameAudio(samples);
    const expected = tf.tidy(() =>
      tf.signal.frame(
        tf.concat1d([tf.zeros([3840], "float32"), tf.tensor1d(samples)]),
        43844,
        36164,
        true,
        0,
      ),
    );
    assert.deepEqual(actual.frames, expected.dataSync());
    assert.deepEqual([actual.count, actual.frameLength], expected.shape);
    expected.dispose();
  }
});
