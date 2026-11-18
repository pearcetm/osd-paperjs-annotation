/**
 * Run: node test/annotationToolPrimaryContact.test.mjs
 */
import assert from 'node:assert';
import {
    annotationToolPrimaryButtonActiveDrag,
    annotationToolPrimaryButtonDownOrUp,
    nativeEventIsPrimaryActiveDrag,
    nativeEventIsPrimaryDownOrUp,
} from '../src/js/papertools/primaryContact.mjs';

function toolEv(native) {
    return { event: native };
}

// --- native down/up ---
assert.strictEqual(nativeEventIsPrimaryDownOrUp(null), false);
assert.strictEqual(nativeEventIsPrimaryDownOrUp({ button: 0 }), true);
assert.strictEqual(nativeEventIsPrimaryDownOrUp({ button: 2 }), false);
assert.strictEqual(nativeEventIsPrimaryDownOrUp({ button: 1 }), false);
assert.strictEqual(nativeEventIsPrimaryDownOrUp({ button: 0, isPrimary: false }), false);
assert.strictEqual(nativeEventIsPrimaryDownOrUp({ button: 0, isPrimary: true, pointerType: 'touch' }), true);
assert.strictEqual(nativeEventIsPrimaryDownOrUp({ button: 0, pointerType: 'pen' }), true);
// Raw TouchEvent (Paper 0.17 mobile): no button
assert.strictEqual(nativeEventIsPrimaryDownOrUp({ touches: [{}], changedTouches: [{}] }), true);
assert.strictEqual(nativeEventIsPrimaryDownOrUp({ changedTouches: [{}] }), true);

// --- native drag ---
assert.strictEqual(nativeEventIsPrimaryActiveDrag(null), false);
assert.strictEqual(nativeEventIsPrimaryActiveDrag({ buttons: 1 }), true);
assert.strictEqual(nativeEventIsPrimaryActiveDrag({ buttons: 0 }), false);
assert.strictEqual(nativeEventIsPrimaryActiveDrag({ buttons: 2 }), false);
assert.strictEqual(nativeEventIsPrimaryActiveDrag({ buttons: 1, isPrimary: false }), false);
assert.strictEqual(nativeEventIsPrimaryActiveDrag({ touches: [{}, {}] }), true);
assert.strictEqual(nativeEventIsPrimaryActiveDrag({ touches: [] }), false);

// --- ToolEvent wrappers ---
assert.strictEqual(annotationToolPrimaryButtonDownOrUp(toolEv({ button: 0 })), true);
assert.strictEqual(annotationToolPrimaryButtonDownOrUp(toolEv({ button: 2 })), false);
assert.strictEqual(annotationToolPrimaryButtonDownOrUp(toolEv({ touches: [{}] })), true);
assert.strictEqual(annotationToolPrimaryButtonDownOrUp({}), false);
assert.strictEqual(annotationToolPrimaryButtonActiveDrag(toolEv({ buttons: 1 })), true);
assert.strictEqual(annotationToolPrimaryButtonActiveDrag(toolEv({ buttons: 0 })), false);
assert.strictEqual(annotationToolPrimaryButtonActiveDrag(toolEv({ touches: [{}] })), true);

console.log('annotationToolPrimaryContact.test.mjs: ok');
