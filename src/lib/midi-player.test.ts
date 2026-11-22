import assert from "node:assert/strict";
import test from "node:test";
import { MidiPlayer } from "./midi-player";

const notes = [
  { pitch: 69, start: 0, duration: 2, confidence: 1 },
  { pitch: 57, start: 1.25, duration: 2, confidence: 0.5 },
];

function fixture(resume = () => Promise.resolve()) {
  const voices: { frequency: { value: number }; started?: number; stopped?: number }[] = [];
  const times: { time: number; ended: boolean }[] = [];
  const context = {
    currentTime: 10, destination: {}, resume,
    createDynamicsCompressor: () => ({ connect() {}, disconnect() {} }),
    createGain: () => ({
      gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {}, disconnect() {},
    }),
    createOscillator: () => {
      const voice = {
        frequency: { value: 0 }, started: undefined as number | undefined, stopped: undefined as number | undefined,
        connect() {}, start(time: number) { this.started = time; }, stop(time = 0) { this.stopped = time; },
      };
      voices.push(voice);
      return voice;
    },
  };
  const player = new MidiPlayer((time, ended) => times.push({ time, ended }), () => context as unknown as AudioContext);
  return { player, voices, times, context };
}

test("MIDI scheduling resumes held notes, plays polyphony and cancels on pause", async () => {
  const { player, voices, context } = fixture();
  try {
    assert.equal(await player.play(notes, 1, 0.5, 4), true);
    assert.deepEqual([voices[0].frequency.value, voices[0].started, voices[0].stopped], [440, 10, 12.025]);
    assert.equal(voices.length, 1);
    context.currentTime = 12;
    assert.equal(player.currentTime, 2);
    player.seek(1.25);
    assert.equal(voices[0].stopped, 0);
    assert.deepEqual(voices.slice(1).map((voice) => [voice.frequency.value, voice.started]), [[440, 12], [220, 12]]);
    player.update(notes, 1);
    assert.equal(voices[3].stopped, 12.775);
    player.stop();
    assert.ok(voices.every((voice) => voice.stopped === 0));
  } finally {
    player.stop();
  }
});

test("seeking to the end stops playback and reports the end position", async () => {
  const { player, times } = fixture();
  try {
    await player.play(notes, 0, 1, 4);
    player.seek(4);
    assert.equal(player.active, false);
    assert.deepEqual(times.at(-1), { time: 4, ended: true });
  } finally {
    player.stop();
  }
});

test("cancelling before AudioContext resumes does not start MIDI voices", async () => {
  let resume!: () => void;
  const waiting = new Promise<void>((resolve) => { resume = resolve; });
  const { player, voices } = fixture(() => waiting);
  const play = player.play(notes, 0, 1, 4);
  player.stop();
  resume();
  assert.equal(await play, false);
  assert.equal(voices.length, 0);
});
