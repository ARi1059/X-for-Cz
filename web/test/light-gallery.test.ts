import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampSelection, cropTexture, galleryMoods, galleryPose } from '../src/components/light-gallery-model.ts';

test('gallery selection stays in bounds for zero, one and five photographs', () => {
  assert.equal(clampSelection(-1, 5), 0); assert.equal(clampSelection(5, 5), 4);
  assert.equal(clampSelection(3, 0), 0); assert.equal(clampSelection(3, 1), 0);
  assert.equal(galleryMoods.length, 5);
});
test('vertical gallery puts successive photos below the selected frame with continuous depth', () => {
  const center = galleryPose(2, 2), before = galleryPose(1, 2), after = galleryPose(3, 2);
  assert.equal(center.x, 0); assert.equal(Math.abs(center.y), 0); assert.equal(Math.abs(center.z), 0);
  assert.ok(before.y > 0 && after.y < 0); assert.equal(before.z, after.z); assert.ok(before.z < 0);
  const halfway = galleryPose(3, 2.5); assert.equal(halfway.y, -2.225);
  assert.ok(halfway.z > after.z && halfway.z < 0);
});
test('texture crop preserves aspect ratio and focal point without changing image pixels', () => {
  const landscape = cropTexture(2000, 1000, 2 / 3, { x: 1, y: 0 });
  assert.equal(landscape.repeatY, 1); assert.equal(landscape.repeatX, 1 / 3); assert.ok(Math.abs(landscape.offsetX - 2 / 3) < 1e-12);
  const portrait = cropTexture(1000, 2000, 1, { x: 0, y: 1 });
  assert.equal(portrait.repeatX, 1); assert.equal(portrait.repeatY, 0.5); assert.equal(portrait.offsetY, 0);
});
