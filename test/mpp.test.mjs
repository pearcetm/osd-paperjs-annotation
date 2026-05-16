/**
 * Run: node test/mpp.test.mjs
 */
import assert from 'node:assert';
import { mppFromTiledImage, mppFromActiveViewerImage } from '../src/js/utils/mpp.mjs';

const validMpp = { x: 0.5, y: 0.5 };

assert.deepStrictEqual(
    mppFromTiledImage({ source: { mpp: validMpp } }),
    validMpp,
);

assert.strictEqual(mppFromTiledImage({ source: {} }), null);
assert.strictEqual(mppFromTiledImage(null), null);
assert.strictEqual(mppFromTiledImage({ source: { mpp: { x: NaN, y: 0.5 } } }), null);
assert.strictEqual(mppFromTiledImage({ source: { mpp: { x: 0, y: 0.5 } } }), null);
assert.strictEqual(mppFromTiledImage({ source: { mpp: { x: 0.5, y: -1 } } }), null);

assert.strictEqual(mppFromActiveViewerImage(null), null);
assert.strictEqual(
    mppFromActiveViewerImage({ world: { getItemCount: () => 0, getItemAt: () => null } }),
    null,
);
assert.strictEqual(
    mppFromActiveViewerImage({ world: { getItemCount: () => 2, getItemAt: () => ({ source: { mpp: validMpp } }) } }),
    null,
);
assert.deepStrictEqual(
    mppFromActiveViewerImage({
        world: {
            getItemCount: () => 1,
            getItemAt: () => ({ source: { mpp: validMpp } }),
        },
    }),
    validMpp,
);

console.log('mpp.test.mjs: ok');
