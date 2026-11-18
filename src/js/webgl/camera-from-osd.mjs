/**
 * OSD viewport → WebGL clip-space transforms for image-pixel coordinates.
 *
 * Flip handling mirrors PaperOverlay:
 * - TiledImage flip: mirror viewport X about item bounds center (after image→viewport)
 * - Viewport flip: mirror screen X about canvas width (OSD drawer does this only when painting tiles)
 */

import { OpenSeadragon } from '../osd-loader.mjs';

/**
 * @param {OpenSeadragon.TiledImage} tiledImage
 * @returns {boolean}
 */
function isTiledImageFlipped(tiledImage) {
    if (typeof tiledImage.getFlip === 'function') {
        return Boolean(tiledImage.getFlip());
    }
    return Boolean(tiledImage.flipped);
}

/**
 * @param {OpenSeadragon.Viewer} viewer
 * @returns {boolean}
 */
function isViewportFlipped(viewer) {
    const vp = viewer?.viewport;
    if (!vp) {
        return false;
    }
    if (typeof vp.getFlip === 'function') {
        return Boolean(vp.getFlip());
    }
    return Boolean(vp.flipped);
}

/**
 * Mirror a viewport-space point about the tiled image's unrotated bounds center.
 * @param {OpenSeadragon.TiledImage} tiledImage
 * @param {OpenSeadragon.Point} vpPoint
 * @returns {OpenSeadragon.Point}
 */
function applyTiledImageFlipInViewport(tiledImage, vpPoint) {
    if (!isTiledImageFlipped(tiledImage)) {
        return vpPoint;
    }
    const bounds = tiledImage.getBoundsNoRotate(true);
    const cx = bounds.x + bounds.width / 2;
    return new OpenSeadragon.Point(2 * cx - vpPoint.x, vpPoint.y);
}

/**
 * Inverse of {@link applyTiledImageFlipInViewport} (horizontal mirror is its own inverse).
 * @param {OpenSeadragon.TiledImage} tiledImage
 * @param {OpenSeadragon.Point} vpPoint
 * @returns {OpenSeadragon.Point}
 */
function undoTiledImageFlipInViewport(tiledImage, vpPoint) {
    return applyTiledImageFlipInViewport(tiledImage, vpPoint);
}

/**
 * @param {number} screenX
 * @param {number} canvasWidth
 * @param {boolean} flipped
 * @returns {number}
 */
function mirrorScreenX(screenX, canvasWidth, flipped) {
    return flipped ? canvasWidth - screenX : screenX;
}

/**
 * Map an image-pixel point to normalized device coordinates [-1, 1].
 * @param {OpenSeadragon.Viewer} viewer
 * @param {OpenSeadragon.TiledImage} tiledImage
 * @param {number} ix
 * @param {number} iy
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @returns {{ x: number, y: number }}
 */
export function imagePixelToClip(viewer, tiledImage, ix, iy, canvasWidth, canvasHeight) {
    let vp = tiledImage.imageToViewportCoordinates(new OpenSeadragon.Point(ix, iy));
    vp = applyTiledImageFlipInViewport(tiledImage, vp);
    const screen = viewer.viewport.viewportToViewerElementCoordinates(vp);
    const sx = mirrorScreenX(screen.x, canvasWidth, isViewportFlipped(viewer));
    return {
        x: (sx / canvasWidth) * 2 - 1,
        y: 1 - (screen.y / canvasHeight) * 2,
    };
}

/**
 * Build a column-major mat4 that maps image-pixel coords (relative to origin) to clip space.
 * Uses an affine fit from origin, +X, and +Y basis points.
 * @param {OpenSeadragon.Viewer} viewer
 * @param {OpenSeadragon.TiledImage} tiledImage
 * @param {{ x: number, y: number }} origin Image-pixel origin for float32 precision
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @returns {Float32Array}
 */
export function computeImageToClipMatrix(viewer, tiledImage, origin, canvasWidth, canvasHeight) {
    const ox = origin.x;
    const oy = origin.y;
    const c0 = imagePixelToClip(viewer, tiledImage, ox, oy, canvasWidth, canvasHeight);
    const c1 = imagePixelToClip(viewer, tiledImage, ox + 1, oy, canvasWidth, canvasHeight);
    const c2 = imagePixelToClip(viewer, tiledImage, ox, oy + 1, canvasWidth, canvasHeight);

    const m0 = c1.x - c0.x;
    const m1 = c2.x - c0.x;
    const m2 = c0.x;
    const m3 = c1.y - c0.y;
    const m4 = c2.y - c0.y;
    const m5 = c0.y;

    const matrix = new Float32Array(16);
    matrix[0] = m0;
    matrix[1] = m3;
    matrix[4] = m1;
    matrix[5] = m4;
    matrix[12] = m2;
    matrix[13] = m5;
    matrix[10] = 1;
    matrix[15] = 1;
    return matrix;
}

/**
 * @param {OpenSeadragon.Viewer} viewer
 * @returns {OpenSeadragon.TiledImage|null}
 */
export function getPrimaryTiledImage(viewer) {
    if (!viewer?.world?.getItemCount()) {
        return null;
    }
    return viewer.world.getItemAt(viewer.world.getItemCount() - 1);
}

/**
 * Suggested origin for float32 vertex storage (image-pixel top-left).
 * @param {OpenSeadragon.TiledImage} [_tiledImage]
 * @returns {{ x: number, y: number }}
 */
export function defaultImageOrigin(_tiledImage) {
    return { x: 0, y: 0 };
}

/**
 * Map clip-space NDC back to image pixels (for hit testing).
 * @param {OpenSeadragon.Viewer} viewer
 * @param {OpenSeadragon.TiledImage} tiledImage
 * @param {number} clipX
 * @param {number} clipY
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @returns {{ x: number, y: number }}
 */
export function clipToImagePixel(viewer, tiledImage, clipX, clipY, canvasWidth, canvasHeight) {
    let screenX = ((clipX + 1) / 2) * canvasWidth;
    const screenY = (1 - (clipY + 1) / 2) * canvasHeight;
    screenX = mirrorScreenX(screenX, canvasWidth, isViewportFlipped(viewer));
    let vp = viewer.viewport.viewerElementToViewportCoordinates(
        new OpenSeadragon.Point(screenX, screenY)
    );
    vp = undoTiledImageFlipInViewport(tiledImage, vp);
    const image = tiledImage.viewportToImageCoordinates(vp);
    return { x: image.x, y: image.y };
}

/**
 * Map viewer element coordinates to image pixels.
 * @param {OpenSeadragon.Viewer} viewer
 * @param {OpenSeadragon.TiledImage} tiledImage
 * @param {number} screenX
 * @param {number} screenY
 * @returns {{ x: number, y: number }}
 */
export function screenToImagePixel(viewer, tiledImage, screenX, screenY) {
    const width = viewer.container?.clientWidth
        || viewer.viewport?.getContainerSize?.()?.x
        || 0;
    const sx = mirrorScreenX(screenX, width, isViewportFlipped(viewer));
    let vp = viewer.viewport.viewerElementToViewportCoordinates(
        new OpenSeadragon.Point(sx, screenY)
    );
    vp = undoTiledImageFlipInViewport(tiledImage, vp);
    const image = tiledImage.viewportToImageCoordinates(vp);
    return { x: image.x, y: image.y };
}
