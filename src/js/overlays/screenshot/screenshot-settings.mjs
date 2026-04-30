const STORAGE_KEY = 'osd-paperjs-annotation.screenshotOverlay.v1';

function clampNumber(v, { min = -Infinity, max = Infinity, fallback = 0 } = {}) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
}

export function defaultScreenshotSettings() {
    return {
        mode: 'free', // 'free' | 'fixed'
        output: {
            mode: 'preset', // 'preset' | 'other'
            presetFactor: 1,
            otherFactor: 1,
        },
        free: {
            aspectLocked: false,
            aspectWidth: 1,
            aspectHeight: 1,
        },
        fixed: {
            baseWidthPx: 256,
            baseHeightPx: 256,
            autoCreateOnClick: true,
        },
    };
}

export function loadScreenshotSettings() {
    const defaults = defaultScreenshotSettings();
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaults;
        const parsed = JSON.parse(raw);
        return normalizeScreenshotSettings(parsed, defaults);
    } catch {
        return defaults;
    }
}

export function saveScreenshotSettings(settings) {
    try {
        const normalized = normalizeScreenshotSettings(settings, defaultScreenshotSettings());
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
        // ignore storage errors (private mode, quota, etc.)
    }
}

export function normalizeScreenshotSettings(input, defaults = defaultScreenshotSettings()) {
    const s = input && typeof input === 'object' ? input : {};
    const mode = s.mode === 'fixed' ? 'fixed' : 'free';

    const free = s.free && typeof s.free === 'object' ? s.free : {};
    const fixed = s.fixed && typeof s.fixed === 'object' ? s.fixed : {};
    const outputIn = s.output && typeof s.output === 'object' ? s.output : {};

    const aspectWidth = clampNumber(free.aspectWidth ?? defaults.free.aspectWidth, { min: 0.001, max: 1e9, fallback: defaults.free.aspectWidth });
    const aspectHeight = clampNumber(free.aspectHeight ?? defaults.free.aspectHeight, { min: 0.001, max: 1e9, fallback: defaults.free.aspectHeight });

    const baseWidthPx = Math.round(clampNumber(fixed.baseWidthPx ?? defaults.fixed.baseWidthPx, { min: 1, max: 1e7, fallback: defaults.fixed.baseWidthPx }));
    const baseHeightPx = Math.round(clampNumber(fixed.baseHeightPx ?? defaults.fixed.baseHeightPx, { min: 1, max: 1e7, fallback: defaults.fixed.baseHeightPx }));
    const autoCreateOnClick = fixed.autoCreateOnClick == null ? defaults.fixed.autoCreateOnClick : Boolean(fixed.autoCreateOnClick);

    // Migrate older settings that stored fixed.downsampleFactor on the fixed object.
    const legacyFactor = fixed.downsampleFactor;

    let outputMode = outputIn.mode === 'other' ? 'other' : 'preset';
    let presetFactor = clampNumber(
        outputIn.presetFactor ?? legacyFactor ?? defaults.output.presetFactor,
        { min: 0.000001, max: 1e9, fallback: defaults.output.presetFactor }
    );
    // If legacy factor wasn't a clean power-of-two, treat it as "other".
    if (legacyFactor != null && outputIn.mode == null && outputIn.presetFactor == null) {
        const isPow2 = Number.isFinite(legacyFactor) && legacyFactor > 0 && Math.log2(legacyFactor) % 1 === 0;
        if (!isPow2) {
            outputMode = 'other';
        }
    }

    const otherFactor = clampNumber(
        outputIn.otherFactor ?? (outputMode === 'other' ? legacyFactor : defaults.output.otherFactor),
        { min: 0.000001, max: 1e9, fallback: defaults.output.otherFactor }
    );

    return {
        mode,
        output: {
            mode: outputMode,
            presetFactor,
            otherFactor,
        },
        free: {
            aspectLocked: Boolean(free.aspectLocked),
            aspectWidth,
            aspectHeight,
        },
        fixed: {
            baseWidthPx,
            baseHeightPx,
            autoCreateOnClick,
        },
    };
}

