function clampDecimals(decimals, fallback = 2) {
    const n = Number.isFinite(decimals) ? Math.trunc(decimals) : fallback;
    return Math.max(0, n);
}

function normalizeRoundingMode(mode, fallback = 'round') {
    return mode === 'truncate' || mode === 'round' ? mode : fallback;
}

function formatDecimal(value, decimals = 2, roundingMode = 'round') {
    if (!Number.isFinite(value)) return '—';
    const d = clampDecimals(decimals, 2);
    const mode = normalizeRoundingMode(roundingMode, 'round');
    if (mode === 'round') {
        return value.toFixed(d);
    }
    const factor = 10 ** d;
    const truncated = Math.trunc(value * factor) / factor;
    return truncated.toFixed(d);
}

export { clampDecimals, normalizeRoundingMode, formatDecimal };
