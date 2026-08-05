/**
 * Run: node test/overlayPointerRouter.test.mjs
 */
import assert from 'node:assert';
import {
    OverlayPointerRouter,
    OVERLAY_POINTER_CLAIM,
    OVERLAY_POINTER_DECLINE,
    OVERLAY_POINTER_MISS,
} from '../src/js/overlays/overlay-pointer-router.mjs';

function makeElement() {
    const listeners = new Map();
    return {
        listeners,
        addEventListener(type, listener) {
            listeners.set(type, listener);
        },
        removeEventListener(type, listener) {
            if (listeners.get(type) === listener) listeners.delete(type);
        },
        contains(target) {
            return target === this || target?.inside === this;
        },
    };
}

function makeFixture() {
    const container = makeElement();
    const canvas = makeElement();
    const destroyHandlers = [];
    const viewer = {
        container,
        canvas,
        PaperOverlays: [],
        addOnceHandler(type, handler) {
            if (type === 'destroy') destroyHandlers.push(handler);
        },
    };
    return {
        viewer,
        router: new OverlayPointerRouter(viewer),
        destroy() {
            destroyHandlers.forEach((handler) => handler());
        },
    };
}

function dispatch(fixture, target = fixture.viewer.canvas) {
    const event = {
        target,
        prevented: false,
        stopped: false,
        preventDefault() { this.prevented = true; },
        stopPropagation() { this.stopped = true; },
    };
    fixture.viewer.container.listeners.get('contextmenu')(event);
    return event;
}

{
    const fixture = makeFixture();
    const back = {};
    const front = {};
    fixture.viewer.PaperOverlays.push(back, front);
    const calls = [];
    fixture.router.register(back, 'contextmenu', () => {
        calls.push('back');
        return OVERLAY_POINTER_CLAIM;
    });
    fixture.router.register(front, 'contextmenu', () => {
        calls.push('front');
        return OVERLAY_POINTER_DECLINE;
    });
    const event = dispatch(fixture);
    assert.deepStrictEqual(calls, ['front', 'back']);
    assert.strictEqual(event.prevented, true);
    assert.strictEqual(event.stopped, true);
}

{
    const fixture = makeFixture();
    const back = {};
    const front = {};
    fixture.viewer.PaperOverlays.push(back, front);
    const calls = [];
    fixture.router.register(back, 'contextmenu', () => {
        calls.push('back');
        return OVERLAY_POINTER_CLAIM;
    });
    fixture.router.register(front, 'contextmenu', () => {
        calls.push('front');
        return OVERLAY_POINTER_MISS;
    });
    dispatch(fixture);
    assert.deepStrictEqual(calls, ['front', 'back']);
}

{
    const fixture = makeFixture();
    const back = {};
    const front = {};
    fixture.viewer.PaperOverlays.push(back, front);
    const calls = [];
    fixture.router.register(back, 'contextmenu', () => {
        calls.push('back');
        return OVERLAY_POINTER_CLAIM;
    });
    fixture.router.register(front, 'contextmenu', () => {
        calls.push('front');
        return OVERLAY_POINTER_CLAIM;
    });
    dispatch(fixture);
    assert.deepStrictEqual(calls, ['front']);
}

{
    const fixture = makeFixture();
    const overlay = {};
    fixture.viewer.PaperOverlays.push(overlay);
    let calls = 0;
    fixture.router.register(overlay, 'contextmenu', () => {
        calls += 1;
        return OVERLAY_POINTER_CLAIM;
    });
    const event = dispatch(fixture, {});
    assert.strictEqual(calls, 0);
    assert.strictEqual(event.prevented, false);
    fixture.destroy();
    assert.strictEqual(fixture.viewer.container.listeners.has('contextmenu'), false);
}

{
    const fixture = makeFixture();
    const overlay = {};
    fixture.viewer.PaperOverlays.push(overlay);
    fixture.router.register(overlay, 'contextmenu', () => OVERLAY_POINTER_MISS);
    const event = dispatch(fixture);
    assert.strictEqual(event.prevented, false);
    assert.strictEqual(event.stopped, false);
}

console.log('overlayPointerRouter.test.mjs: ok');
