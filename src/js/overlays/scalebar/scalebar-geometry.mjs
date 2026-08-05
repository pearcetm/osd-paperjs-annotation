/**
 * Live scalebar geometry helpers.
 * Physical lengths are handled in µm internally; display units are 'mm' | 'um'.
 * Contract: mpp.x is µm per source pixel (same as utils/mpp.mjs).
 */

/** Nice lengths in mm (same policy as ScreenshotOverlay). */
export const NICE_LENGTHS_MM = [20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];

/**
 * @param {'mm'|'um'} unit
 * @returns {string}
 */
export function unitLabel(unit) {
    return unit === 'um' ? 'µm' : 'mm';
}

/**
 * @param {number} value
 * @returns {string}
 */
export function formatPhysicalValue(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return n.toFixed(4).replace(/\.?0+$/, '');
}

/**
 * @param {number} lengthUm
 * @param {'mm'|'um'} unit
 * @returns {string}
 */
export function formatScalebarLabel(lengthUm, unit) {
    const u = unit === 'um' ? 'um' : 'mm';
    const value = u === 'um' ? lengthUm : lengthUm / 1000;
    const text = formatPhysicalValue(value);
    if (!text) return '';
    return `${text} ${unitLabel(u)}`;
}

/**
 * Convert a display-unit length to µm.
 * @param {number} length
 * @param {'mm'|'um'} unit
 * @returns {number}
 */
export function toMicrons(length, unit) {
    const n = Number(length);
    if (!Number.isFinite(n)) return NaN;
    return unit === 'um' ? n : n * 1000;
}

/**
 * Convert µm to display-unit length.
 * @param {number} lengthUm
 * @param {'mm'|'um'} unit
 * @returns {number}
 */
export function fromMicrons(lengthUm, unit) {
    const n = Number(lengthUm);
    if (!Number.isFinite(n)) return NaN;
    return unit === 'um' ? n : n / 1000;
}

/**
 * Screen pixels for a physical length at the current viewer zoom.
 * Uses image→viewer-element mapping on the active tiled image.
 *
 * @param {number} lengthUm
 * @param {number} mppX µm per source pixel
 * @param {number} screenPxPerImagePx viewer-element pixels per source pixel along X
 * @returns {number}
 */
export function physicalUmToScreenPx(lengthUm, mppX, screenPxPerImagePx) {
    const um = Number(lengthUm);
    const mpp = Number(mppX);
    const scale = Number(screenPxPerImagePx);
    if (!Number.isFinite(um) || um <= 0 || !Number.isFinite(mpp) || mpp <= 0 || !Number.isFinite(scale) || scale <= 0) {
        return NaN;
    }
    return (um / mpp) * scale;
}

/**
 * Pick a nice physical length (µm) targeting ~12.5% of viewport width.
 * Adapted from ScreenshotOverlay._computeSmartScalebarLengthMm.
 *
 * @param {{ mppX: number, viewportWidthPx: number, screenPxPerImagePx: number }} params
 * @returns {number | null} length in µm, or null if inputs are invalid
 */
export function computeSmartScalebarLengthUm({ mppX, viewportWidthPx, screenPxPerImagePx }) {
    const mpp = Number(mppX);
    const outW = Number(viewportWidthPx);
    const scale = Number(screenPxPerImagePx);
    if (!Number.isFinite(mpp) || mpp <= 0 || !Number.isFinite(outW) || outW <= 0 || !Number.isFinite(scale) || scale <= 0) {
        return null;
    }

    const targetPx = Math.max(24, Math.round(outW * 0.125));
    let best = null;
    for (const mm of NICE_LENGTHS_MM) {
        const um = mm * 1000;
        const px = Math.max(1, Math.round(physicalUmToScreenPx(um, mpp, scale)));
        const tooSmall = px < 16;
        const tooBig = px > Math.round(outW * 0.4);
        const penalty = (tooSmall || tooBig) ? outW : 0;
        const score = Math.abs(px - targetPx) + penalty;
        if (!best || score < best.score) {
            best = { um, px, score };
        }
    }
    return best?.um ?? null;
}

/**
 * Bottom-right bar rectangle in viewer/paper coordinates.
 *
 * @param {{ viewportWidth: number, viewportHeight: number, barWidthPx: number, barHeightPx: number, paddingPx?: number }} params
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function bottomRightBarRect({
    viewportWidth,
    viewportHeight,
    barWidthPx,
    barHeightPx,
    paddingPx = 12,
}) {
    const pad = Number.isFinite(paddingPx) ? Math.max(0, paddingPx) : 12;
    const w = Math.max(1, Math.round(barWidthPx));
    const h = Math.max(1, Math.round(barHeightPx));
    const vw = Math.max(0, Number(viewportWidth) || 0);
    const vh = Math.max(0, Number(viewportHeight) || 0);
    const x2 = vw - pad;
    const y2 = vh - pad;
    const x1 = Math.max(pad, x2 - w);
    const y1 = Math.max(pad, y2 - h);
    return {
        x: x1,
        y: y1,
        width: Math.max(1, x2 - x1),
        height: Math.max(1, y2 - y1),
    };
}
