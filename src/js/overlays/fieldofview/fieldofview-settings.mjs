const STORAGE_KEY = 'osd-paperjs-annotation.fieldOfViewOverlay.v1';

function clampNumber(v, { min = -Infinity, max = Infinity, fallback = 0 } = {}) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
}

export function defaultFieldOfViewSettings() {
    return {
        diameter: 0.55, // numeric value in selected unit
        unit: 'mm', // 'mm' | 'um'
    };
}

export function normalizeFieldOfViewSettings(input, defaults = defaultFieldOfViewSettings()) {
    const s = input && typeof input === 'object' ? input : {};
    const unit = s.unit === 'um' ? 'um' : 'mm';
    const diameter = clampNumber(s.diameter ?? defaults.diameter, { min: 0.000001, max: 1e12, fallback: defaults.diameter });
    return { diameter, unit };
}

export function loadFieldOfViewSettings() {
    const defaults = defaultFieldOfViewSettings();
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaults;
        return normalizeFieldOfViewSettings(JSON.parse(raw), defaults);
    } catch {
        return defaults;
    }
}

export function saveFieldOfViewSettings(settings) {
    try {
        const normalized = normalizeFieldOfViewSettings(settings, defaultFieldOfViewSettings());
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
        // ignore storage errors
    }
}

