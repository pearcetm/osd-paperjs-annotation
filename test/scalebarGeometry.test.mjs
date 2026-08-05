/**
 * Run: node test/scalebarGeometry.test.mjs
 */
import assert from 'node:assert';
import {
    bottomRightBarRect,
    computeSmartScalebarLengthUm,
    formatScalebarLabel,
    fromMicrons,
    physicalUmToScreenPx,
    toMicrons,
    unitLabel,
} from '../src/js/overlays/scalebar/scalebar-geometry.mjs';

assert.strictEqual(unitLabel('mm'), 'mm');
assert.strictEqual(unitLabel('um'), 'µm');

assert.strictEqual(toMicrons(1, 'mm'), 1000);
assert.strictEqual(toMicrons(250, 'um'), 250);
assert.strictEqual(fromMicrons(1000, 'mm'), 1);
assert.strictEqual(fromMicrons(250, 'um'), 250);

assert.strictEqual(formatScalebarLabel(1000, 'mm'), '1 mm');
assert.strictEqual(formatScalebarLabel(100, 'um'), '100 µm');
assert.strictEqual(formatScalebarLabel(50, 'mm'), '0.05 mm');

assert.strictEqual(physicalUmToScreenPx(1000, 0.5, 2), 4000);
assert.ok(Number.isNaN(physicalUmToScreenPx(0, 0.5, 2)));

const smart = computeSmartScalebarLengthUm({
    mppX: 0.25,
    viewportWidthPx: 800,
    screenPxPerImagePx: 1,
});
assert.ok(smart != null && Number.isFinite(smart));
assert.ok(smart > 0);

const rect = bottomRightBarRect({
    viewportWidth: 800,
    viewportHeight: 600,
    barWidthPx: 100,
    barHeightPx: 18,
    paddingPx: 12,
});
assert.strictEqual(rect.width, 100);
assert.strictEqual(rect.height, 18);
assert.strictEqual(rect.x, 800 - 12 - 100);
assert.strictEqual(rect.y, 600 - 12 - 18);

console.log('scalebarGeometry.test.mjs: ok');
