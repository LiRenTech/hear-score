import assert from "node:assert/strict";
import test from "node:test";
import type { Midi } from "@tonejs/midi";
import { loadMidi, readMidi } from "./midi";

function midiFile(midi: Midi) {
  return new File([new Uint8Array(midi.toArray()).buffer], "example.mid");
}

test("MIDI import keeps overlapping notes, seconds and velocity across tracks", async () => {
  const Midi = await loadMidi();
  const midi = new Midi();
  midi.header.setTempo(90);
  midi.addTrack().addNote({ midi: 14, time: 0.5, duration: 1, velocity: 0.5 });
  midi.addTrack().addNote({ midi: 112, time: 1, duration: 1, velocity: 0.75 });
  const track = await readMidi(midiFile(midi));
  assert.equal(track.kind, "midi");
  assert.deepEqual(track.notes.map((note) => note.pitch), [14, 112]);
  assert.ok(Math.abs(track.notes[0].start - 0.5) < 0.002);
  assert.ok(Math.abs(track.notes[0].duration - 1) < 0.002);
  assert.ok(Math.abs(track.notes[1].confidence - 0.75) < 0.01);
  assert.ok(Math.abs(track.duration - 2) < 0.002);
});

test("MIDI import rejects invalid, empty and overlong files", async () => {
  await assert.rejects(readMidi(new File(["invalid"], "invalid.midi")), /无法读取/);
  const Midi = await loadMidi();
  const midi = new Midi();
  await assert.rejects(readMidi(midiFile(midi)), /没有可播放的音符/);
  midi.addTrack().addNote({ midi: 60, time: 300, duration: 1 });
  await assert.rejects(readMidi(midiFile(midi)), /最长 5 分钟/);
});
