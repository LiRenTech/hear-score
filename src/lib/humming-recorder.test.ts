import { test } from "node:test";
import assert from "node:assert/strict";
import { HummingRecorder, type HummingUpdate } from "./humming-recorder";

function browser(getStream?: () => Promise<MediaStream>) {
  let stopped = 0, closed = 0;
  const track = { stop: () => { stopped++; }, onended: null };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  const nodes: FakeNode[] = [];
  class FakeNode {
    port = {
      onmessage: null as ((event: { data: Float32Array | string }) => void) | null,
      postMessage: () => { queueMicrotask(() => this.port.onmessage?.({ data: "stopped" })); },
      close: () => {},
    };
    onprocessorerror = null;
    constructor() { nodes.push(this); }
    connect() {}
    disconnect() {}
  }
  const values: Record<string, unknown> = {
    window: { isSecureContext: true },
    navigator: { mediaDevices: { getUserMedia: getStream || (() => Promise.resolve(stream)) } },
    AudioWorkletNode: FakeNode,
    AudioContext: class {
      sampleRate = 16000;
      state = "running";
      audioWorklet = { addModule: async () => {} };
      destination = {};
      onstatechange = null;
      async resume() {}
      async close() { this.state = "closed"; closed++; }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    },
  };
  const originals = Object.fromEntries(Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, value });
  return { stream, nodes, get stopped() { return stopped; }, get closed() { return closed; }, restore() {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  } };
}

test("recording emits notes before stop and saves PCM with sample-accurate duration", async () => {
  const env = browser();
  const frames: HummingUpdate[] = [];
  const recorder = new HummingRecorder((frame) => frames.push(frame), () => {});
  try {
    assert.equal(await recorder.start(), true);
    const signal = Float32Array.from({ length: 16000 }, (_, i) => 0.3 * Math.sin(i * 2 * Math.PI * 220 / 16000));
    for (let offset = 0; offset < signal.length; offset += 512)
      env.nodes[0].port.onmessage?.({ data: signal.slice(offset, offset + 512) });
    assert.equal(frames.at(-1)?.notes[0].pitch, 57);
    assert.ok(frames.at(-1)!.notes[0].duration > 0.8);
    const result = await recorder.stop();
    assert.equal(result.duration, 1);
    assert.deepEqual(result.samples, signal);
    assert.equal(result.notes.length, 1);
    assert.equal(env.stopped, 1);
    assert.equal(env.closed, 1);
    assert.equal(await recorder.stop(), result);
  } finally { recorder.dispose(); env.restore(); }
});
test("cancelled permission requests release a stream granted after leaving the page", async () => {
  let grant: (stream: MediaStream) => void = () => {};
  const env = browser(() => new Promise((resolve) => { grant = resolve; }));
  const recorder = new HummingRecorder(() => assert.fail("late update"), () => {});
  try {
    const pending = recorder.start();
    await Promise.resolve();
    recorder.dispose();
    grant(env.stream);
    assert.equal(await pending, false);
    assert.equal(env.stopped, 1);
    assert.equal(env.closed, 1);
    assert.equal(env.nodes.length, 0);
  } finally { recorder.dispose(); env.restore(); }
});
test("permission denial closes its audio context and reports a useful error", async () => {
  const env = browser(async () => { throw new DOMException("denied", "NotAllowedError"); });
  const recorder = new HummingRecorder(() => {}, () => {});
  try {
    await assert.rejects(recorder.start(), /麦克风权限未开启/);
    assert.equal(env.closed, 1);
    assert.equal(env.nodes.length, 0);
  } finally { recorder.dispose(); env.restore(); }
});

test("five-minute sample limit stops capture without appending queued audio beyond the limit", async () => {
  const env = browser();
  let ending: ReturnType<HummingRecorder["stop"]> | undefined;
  let lastTime = 0;
  const recorder = new HummingRecorder((frame) => { lastTime = frame.time; }, (reason) => {
    assert.match(reason, /5 分钟/);
    ending = recorder.stop();
  });
  try {
    await recorder.start();
    const silence = new Float32Array(512);
    for (let i = 0; i < 9380; i++) env.nodes[0].port.onmessage?.({ data: silence });
    assert.ok(ending);
    const result = await ending;
    assert.equal(lastTime, 300);
    assert.equal(result.duration, 300);
    assert.equal(result.samples.length, 4800000);
    assert.deepEqual(result.notes, []);
    assert.equal(env.stopped, 1);
  } finally { recorder.dispose(); env.restore(); }
});
