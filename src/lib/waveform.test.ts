import { test } from "node:test";
import assert from "node:assert/strict";
import { waveformEnvelope } from "./waveform";

test("waveform preserves positive and negative transients and the final sample", () => {
  const { low, high } = waveformEnvelope(new Float32Array([0, -1, 0.5, 0, 0.75]), 2);
  assert.deepEqual([...low], [-1, 0]);
  assert.deepEqual([...high], [0, 0.75]);
});

test("short and silent audio produce finite envelopes at large canvas widths", () => {
  const { low, high } = waveformEnvelope(new Float32Array([-0.5, 0.5]), 4);
  assert.deepEqual([...low], [-0.5, -0.5, 0, 0]);
  assert.deepEqual([...high], [0, 0, 0.5, 0.5]);
  const empty = waveformEnvelope(new Float32Array(), 4);
  assert.deepEqual([...empty.low, ...empty.high], Array(8).fill(0));
});
