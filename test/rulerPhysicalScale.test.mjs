/**
 * Run: node test/rulerPhysicalScale.test.mjs
 */
import assert from 'node:assert';
import { applyRulerPhysicalScaleFromMpp } from '../src/js/utils/rulerPhysicalScale.mjs';

function makeMockToolbar() {
    return {
        labelUnit: 'px',
        unitsPerPixel: 1,
        unitsInput: { value: 'px' },
        unitsPerPixelInput: { value: '1' },
        updateMeasurement() {},
    };
}

function makeMockToolkit(tc, rulerExtra = {}) {
    const ruler = {
        getToolbarControl: () => tc,
        _lastMeasurement: { p1: null, p2: null, distance: null },
        refreshSegmentLabels: () => {},
        ...rulerExtra,
    };
    return {
        getTool: (name) => (name === 'ruler' ? ruler : null),
    };
}

const mpp = { x: 0.5, y: 0.5 };
const tc = makeMockToolbar();
const toolkit = makeMockToolkit(tc);

assert.strictEqual(applyRulerPhysicalScaleFromMpp(toolkit, mpp), true);
assert.strictEqual(tc.labelUnit, 'mm');
assert.strictEqual(tc.unitsPerPixel, 0.0005);
assert.strictEqual(tc.unitsInput.value, 'mm');
assert.strictEqual(tc.unitsPerPixelInput.value, '0.0005');

const tcUm = makeMockToolbar();
assert.strictEqual(
    applyRulerPhysicalScaleFromMpp(makeMockToolkit(tcUm), mpp, { unit: 'um' }),
    true,
);
assert.strictEqual(tcUm.labelUnit, 'um');
assert.strictEqual(tcUm.unitsPerPixel, 0.5);

const tcUnchanged = makeMockToolbar();
assert.strictEqual(applyRulerPhysicalScaleFromMpp(makeMockToolkit(tcUnchanged), null), false);
assert.strictEqual(tcUnchanged.labelUnit, 'px');
assert.strictEqual(tcUnchanged.unitsPerPixel, 1);

assert.strictEqual(
    applyRulerPhysicalScaleFromMpp({ getTool: () => null }, mpp),
    false,
);

assert.strictEqual(
    applyRulerPhysicalScaleFromMpp(
        { getTool: () => ({ getToolbarControl: () => null }) },
        mpp,
    ),
    false,
);

console.log('rulerPhysicalScale.test.mjs: ok');
