import assert from "node:assert/strict";
import test from "node:test";
import { PianoPreview } from "./piano-preview";

function fixture(resume: () => Promise<void> = () => Promise.resolve()) {
  const voices: { frequency: { value: number }; stopped: number | null; started: boolean }[] = [];
  let closed = false;
  const context = {
    currentTime: 2, sampleRate: 48000, state: "running", destination: {}, resume,
    createGain: () => ({
      gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelAndHoldAtTime() {} },
      connect() {}, disconnect() {},
    }),
    createPeriodicWave: () => ({}),
    createOscillator: () => {
      const voice = {
        frequency: { value: 0 }, stopped: null as number | null, started: false,
        setPeriodicWave() {}, connect() {}, disconnect() {}, onended: null,
        start() { this.started = true; }, stop(time: number) { this.stopped = time; },
      };
      voices.push(voice);
      return voice;
    },
    close: async () => { closed = true; },
  };
  return { preview: new PianoPreview(() => context as unknown as AudioContext), voices, isClosed: () => closed };
}

test("held note has the requested pitch and no scheduled stop until release", async () => {
  const { preview, voices } = fixture();
  await preview.play(69);
  assert.equal(voices[0].frequency.value, 440);
  assert.equal(voices[0].started, true);
  assert.equal(voices[0].stopped, null);
  preview.stop();
  assert.equal(voices[0].stopped, 2.03);
  preview.stop();
});

test("releasing before AudioContext resumes never starts a stuck note", async () => {
  let resume!: () => void;
  const waiting = new Promise<void>((resolve) => { resume = resolve; });
  const { preview, voices } = fixture(() => waiting);
  const play = preview.play(60);
  preview.stop();
  resume();
  await play;
  assert.equal(voices.length, 0);
});

test("rapid key changes only start the latest request and disposal stops it", async () => {
  const { preview, voices, isClosed } = fixture();
  await Promise.all([preview.play(60), preview.play(72)]);
  assert.equal(voices.length, 1);
  assert.ok(Math.abs(voices[0].frequency.value - 523.25113) < 0.001);
  preview.dispose();
  assert.notEqual(voices[0].stopped, null);
  assert.equal(isClosed(), true);
});
