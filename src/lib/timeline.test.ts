import assert from "node:assert/strict";
import test from "node:test";
import { BASE_PIXELS_PER_SECOND, minimumZoom, timelineStep, zoomedScrollLeft } from "./timeline";

test("full-track zoom fits long audio in desktop and narrow viewports below 50%", () => {
  for (const viewport of [360, 1000, 1600]) {
    const zoom = minimumZoom(viewport, 280);
    assert.ok(zoom < 0.5);
    assert.ok(Math.abs(280 * BASE_PIXELS_PER_SECOND * zoom - (viewport - 45)) < 1e-9);
  }
  assert.equal(minimumZoom(1600, 10), 1);
  assert.ok(Number.isFinite(minimumZoom(0, 0)));
});

test("wheel zoom keeps the time under the pointer fixed in both directions", () => {
  for (const nextZoom of [0.1, 0.5, 2, 3]) {
    const scroll = zoomedScrollLeft(2000, 100, 1, nextZoom);
    assert.ok(Math.abs((scroll + 100) / nextZoom - 2100) < 1e-9);
  }
  assert.equal(zoomedScrollLeft(0, 100, 1, 0.5), 0);
});

test("timeline ticks stay legible at full-track and detailed zoom levels", () => {
  for (const scale of [0.5, 1, 3, 12, 24, 48, 144]) {
    const step = timelineStep(scale);
    assert.ok(Number.isInteger(step));
    assert.ok(step * scale >= 40);
  }
});
