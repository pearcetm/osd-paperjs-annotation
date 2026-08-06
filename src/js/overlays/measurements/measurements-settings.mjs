import { clampDecimals } from '../../utils/measurementFormat.mjs';

const STORAGE_KEY = 'osd-paperjs-annotation.measurementsOverlay.v1';

export function defaultMeasurementsSettings() {
    return {
        /** Max decimal places for convenience ruler labels (not scalebar). */
        decimals: 2,
    };
}

/**
 * @param {object} input
 * @param {object} [defaults]
 */
export function normalizeMeasurementsSettings(input, defaults = defaultMeasurementsSettings()) {
    const s = input && typeof input === 'object' ? input : {};
    const decimals = clampDecimals(
        Number.isFinite(Number(s.decimals)) ? Number(s.decimals) : defaults.decimals,
        defaults.decimals,
    );
    // Cap UI range at 6 so labels stay usable.
    return { decimals: Math.min(6, decimals) };
}

export function loadMeasurementsSettings() {
    const defaults = defaultMeasurementsSettings();
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaults;
        return normalizeMeasurementsSettings(JSON.parse(raw), defaults);
    } catch {
        return defaults;
    }
}

export function saveMeasurementsSettings(settings) {
    try {
        const normalized = normalizeMeasurementsSettings(settings, defaultMeasurementsSettings());
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
        // ignore storage errors
    }
}

export { STORAGE_KEY as MEASUREMENTS_SETTINGS_STORAGE_KEY };
