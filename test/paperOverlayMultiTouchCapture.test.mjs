/**
 * Run: node test/paperOverlayMultiTouchCapture.test.mjs
 *
 * Exercises PaperOverlay multi-touch capture flag transitions without a full OSD viewer.
 */
import assert from 'node:assert';

// Minimal stand-in matching the methods under test (mirrors PaperOverlay capture logic).
class CaptureHarness {
    constructor() {
        this._toolInputCapture = false;
        this._multiTouchNavigating = false;
        this._activePointers = new Set();
        this._canvasdiv = { style: { pointerEvents: 'auto', touchAction: '' } };
        this._canvas = { style: { touchAction: '' } };
        this._mouseNavEnabled = false;
        this._cancelCount = 0;
    }

    isMultiTouchNavigating() {
        return !!this._multiTouchNavigating;
    }

    setOSDMouseNavEnabled(enabled = true) {
        const was = this._mouseNavEnabled;
        this._mouseNavEnabled = !!enabled;
        return was;
    }

    setToolInputCapture(enabled = true) {
        if (enabled) {
            if (this._toolInputCapture) return;
            this._toolInputCapture = true;
            this._touchActionBeforeCapture = this._canvas.style.touchAction || '';
            this._canvas.style.touchAction = 'none';
            this._canvasdiv.style.touchAction = 'none';
            return;
        }
        if (!this._toolInputCapture) return;
        this._toolInputCapture = false;
        this._exitMultiTouchNavigate();
        this._activePointers.clear();
        this._canvas.style.touchAction = this._touchActionBeforeCapture || '';
        this._canvasdiv.style.touchAction = this._touchActionBeforeCapture || '';
        this._touchActionBeforeCapture = null;
    }

    _handleCapturePointerDown(ev) {
        if (!this._toolInputCapture) return;
        this._activePointers.add(ev.pointerId);
        if (this._activePointers.size >= 2 && !this._multiTouchNavigating) {
            this._enterMultiTouchNavigate();
        }
    }

    _handleCapturePointerUp(ev) {
        this._activePointers.delete(ev.pointerId);
        if (this._multiTouchNavigating && this._activePointers.size === 0) {
            this._exitMultiTouchNavigate();
        }
    }

    _enterMultiTouchNavigate() {
        if (this._multiTouchNavigating) return;
        this._cancelCount += 1;
        this._multiTouchNavigating = true;
        this._pointerEventsBeforeMultiTouch = this._canvasdiv.style.pointerEvents;
        this.setOSDMouseNavEnabled(true);
        this._canvasdiv.style.pointerEvents = 'none';
    }

    _exitMultiTouchNavigate() {
        if (!this._multiTouchNavigating) return;
        this._multiTouchNavigating = false;
        this._canvasdiv.style.pointerEvents =
            this._pointerEventsBeforeMultiTouch != null
                ? this._pointerEventsBeforeMultiTouch
                : (this._toolInputCapture ? 'auto' : 'none');
        this._pointerEventsBeforeMultiTouch = null;
        if (this._toolInputCapture) {
            this.setOSDMouseNavEnabled(false);
        }
    }
}

const h = new CaptureHarness();
h.setOSDMouseNavEnabled(false);
h.setToolInputCapture(true);
assert.strictEqual(h._canvas.style.touchAction, 'none');
assert.strictEqual(h.isMultiTouchNavigating(), false);

h._handleCapturePointerDown({ pointerId: 1 });
assert.strictEqual(h.isMultiTouchNavigating(), false);
assert.strictEqual(h._cancelCount, 0);

h._handleCapturePointerDown({ pointerId: 2 });
assert.strictEqual(h.isMultiTouchNavigating(), true);
assert.strictEqual(h._cancelCount, 1);
assert.strictEqual(h._canvasdiv.style.pointerEvents, 'none');
assert.strictEqual(h._mouseNavEnabled, true);

h._handleCapturePointerUp({ pointerId: 1 });
assert.strictEqual(h.isMultiTouchNavigating(), true); // one finger still down
h._handleCapturePointerUp({ pointerId: 2 });
assert.strictEqual(h.isMultiTouchNavigating(), false);
assert.strictEqual(h._mouseNavEnabled, false); // capture still on → nav off again
assert.strictEqual(h._canvasdiv.style.pointerEvents, 'auto');

h.setToolInputCapture(false);
assert.strictEqual(h._canvas.style.touchAction, '');

// Second enter cancels once more
h.setOSDMouseNavEnabled(false);
h.setToolInputCapture(true);
h._handleCapturePointerDown({ pointerId: 10 });
h._handleCapturePointerDown({ pointerId: 11 });
assert.strictEqual(h._cancelCount, 2);

console.log('paperOverlayMultiTouchCapture.test.mjs: ok');
