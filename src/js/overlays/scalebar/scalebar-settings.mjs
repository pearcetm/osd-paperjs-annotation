const STORAGE_KEY = 'osd-paperjs-annotation.scalebarOverlay.v1';

function clampNumber(v, { min = -Infinity, max = Infinity, fallback = 0 } = {}) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
}

export function defaultScalebarSettings() {
    return {
        heightPx: 18,
        fontPx: 12,
        unit: 'mm', // 'mm' | 'um'
    };
}

export function normalizeScalebarSettings(input, defaults = defaultScalebarSettings()) {
    const s = input && typeof input === 'object' ? input : {};
    const unit = s.unit === 'um' ? 'um' : 'mm';
    const heightPx = clampNumber(s.heightPx ?? defaults.heightPx, { min: 4, max: 64, fallback: defaults.heightPx });
    const fontPx = clampNumber(s.fontPx ?? defaults.fontPx, { min: 8, max: 48, fallback: defaults.fontPx });
    return { heightPx, fontPx, unit };
}

export function loadScalebarSettings() {
    const defaults = defaultScalebarSettings();
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaults;
        return normalizeScalebarSettings(JSON.parse(raw), defaults);
    } catch {
        return defaults;
    }
}

export function saveScalebarSettings(settings) {
    try {
        const normalized = normalizeScalebarSettings(settings, defaultScalebarSettings());
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
        // ignore storage errors
    }
}

export { STORAGE_KEY as SCALEBAR_SETTINGS_STORAGE_KEY };
