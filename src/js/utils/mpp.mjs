/**
 * Microns-per-pixel (mpp) helpers for tiled image sources.
 * Contract: `tiledImage.source.mpp` is `{ x, y }` in µm/px (microns per source pixel).
 */

/**
 * Read and validate mpp from a tiled image source.
 * @param {OpenSeadragon.TiledImage} tiledImage
 * @returns {{ x: number, y: number } | null}
 */
export function mppFromTiledImage(tiledImage) {
    const mpp = tiledImage?.source?.mpp;
    if (!mpp) return null;
    const x = Number(mpp.x);
    const y = Number(mpp.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return null;
    return { x, y };
}

/**
 * mpp from the sole world item when the viewer has exactly one tiled image.
 * Multi-slide hosts should use {@link mppFromTiledImage} on the chosen image instead.
 * @param {OpenSeadragon.Viewer} viewer
 * @returns {{ x: number, y: number } | null}
 */
export function mppFromActiveViewerImage(viewer) {
    if (!viewer?.world || viewer.world.getItemCount() !== 1) return null;
    return mppFromTiledImage(viewer.world.getItemAt(0));
}
