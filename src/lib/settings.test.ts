import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, parseSettings, wheelAction } from "./settings";

test("settings tolerate missing, corrupt and partially invalid stored data", () => {
  for (const raw of [null, "broken", "null", "[]", "42", '"text"'])
    assert.deepEqual(parseSettings(raw), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{"altWheel":"bad","middleDrag":false,"shiftWheel":"none"}'),
    { ...DEFAULT_SETTINGS, middleDrag: false, shiftWheel: "none" });
  assert.equal(parseSettings('{"commandWheel":"toString"}').commandWheel, DEFAULT_SETTINGS.commandWheel);
});

test("custom mappings survive serialization and route Ctrl and Command identically", () => {
  const settings = { ...DEFAULT_SETTINGS, commandWheel: "scroll-vertical" as const, altWheel: "none" as const, middleDrag: false };
  assert.deepEqual(parseSettings(JSON.stringify(settings)), settings);
  const event = { altKey: false, shiftKey: false, ctrlKey: false, metaKey: false };
  assert.equal(wheelAction(settings, event), null);
  assert.equal(wheelAction(settings, { ...event, ctrlKey: true }), "scroll-vertical");
  assert.equal(wheelAction(settings, { ...event, metaKey: true }), "scroll-vertical");
  assert.equal(wheelAction(settings, { ...event, shiftKey: true }), "scroll-horizontal");
  assert.equal(wheelAction(settings, { ...event, altKey: true, ctrlKey: true, shiftKey: true }), "none");
});
