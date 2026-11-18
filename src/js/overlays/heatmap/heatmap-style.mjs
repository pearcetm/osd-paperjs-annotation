/**
 * Default heatmap style (geojs-inspired).
 */

export const DEFAULT_HEATMAP_STYLE = {
    radius: 25,
    blurRadius: 15,
    gaussian: true,
    scaleWithZoom: false,
    color: {
        0: { r: 0, g: 0, b: 0, a: 0 },
        0.25: { r: 0, g: 1, b: 0, a: 0.5 },
        0.5: { r: 1, g: 1, b: 0, a: 0.8 },
        1: { r: 1, g: 0, b: 0, a: 1 },
    },
};

export const DEFAULT_HEATMAP_OPTIONS = {
    binned: 'auto',
    updateDelay: -1,
    minIntensity: null,
    maxIntensity: null,
};

/**
 * @param {object} partial
 * @returns {object}
 */
export function mergeHeatmapStyle(partial = {}) {
    return {
        ...DEFAULT_HEATMAP_STYLE,
        ...partial,
        color: {
            ...DEFAULT_HEATMAP_STYLE.color,
            ...(partial.color || {}),
        },
    };
}

/**
 * @param {string|object} color
 * @returns {string}
 */
export function colorToRgbaString(color) {
    if (typeof color === 'string') {
        return color;
    }
    const { r, g, b, a = 1 } = color;
    const rr = Math.round((r <= 1 ? r * 255 : r));
    const gg = Math.round((g <= 1 ? g * 255 : g));
    const bb = Math.round((b <= 1 ? b * 255 : b));
    return `rgba(${rr},${gg},${bb},${a})`;
}
