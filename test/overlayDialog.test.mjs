/**
 * Run: node test/overlayDialog.test.mjs
 */
import assert from 'node:assert';
import {
    isOverlayDialogElement,
    nextCanvasZIndex,
    OVERLAY_DIALOG_CLASS,
} from '../src/js/utils/overlayDialog.mjs';

function elementWithClasses(...classes) {
    return { classList: { contains: (c) => classes.includes(c) } };
}

assert.strictEqual(isOverlayDialogElement(elementWithClasses(OVERLAY_DIALOG_CLASS)), true);
assert.strictEqual(isOverlayDialogElement(elementWithClasses('config-dialog')), false);
assert.strictEqual(isOverlayDialogElement(null), false);
assert.strictEqual(isOverlayDialogElement({}), false);

// 'auto' and non-numeric values count as 0; the canvas only needs to clear the toolbars.
assert.strictEqual(nextCanvasZIndex(['auto', 'auto']), 1);
assert.strictEqual(nextCanvasZIndex([]), 1);
assert.strictEqual(nextCanvasZIndex(undefined), 1);
assert.strictEqual(nextCanvasZIndex(['auto', '2', '5']), 6);
assert.strictEqual(nextCanvasZIndex([3, -10]), 4);

// Dialog z-indexes are filtered out before this call, so the canvas stays below them.
const siblingZ = ['auto', '2'];
assert.ok(nextCanvasZIndex(siblingZ) < 10000);

console.log('overlayDialog.test.mjs: ok');
