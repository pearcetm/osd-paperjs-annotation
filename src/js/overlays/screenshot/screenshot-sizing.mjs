/**
 * Shared helpers for screenshot output sizing from a base (full-res) region size.
 */

export function computeOutputSize(baseW, baseH, factor) {
    const f = Number(factor);
    const bw = Number(baseW);
    const bh = Number(baseH);
    if (!Number.isFinite(f) || f <= 0) return { outW: 1, outH: 1 };
    const outW = Math.max(1, Math.round(bw / f));
    const outH = Math.max(1, Math.round(bh / f));
    return { outW, outH };
}

/**
 * Build preset power-of-two downsample options plus an "Other..." sentinel.
 */
export function buildDownsampleOptions({
    baseW,
    baseH,
    maxDim = 23767,
    maxArea = 268435456,
    factors = [1, 2, 4, 8, 16, 32],
} = {}) {
    const bw = Number(baseW);
    const bh = Number(baseH);
    const opts = [];

    factors.forEach((f) => {
        const factor = Number(f);
        if (!Number.isFinite(factor) || factor <= 0) return;
        const { outW, outH } = computeOutputSize(bw, bh, factor);
        let disabledReason = null;
        if (outW < 1 || outH < 1) disabledReason = 'Too small';
        else if (outW > maxDim || outH > maxDim) disabledReason = 'Exceeds maximum dimension';
        else if (outW * outH > maxArea) disabledReason = 'Exceeds maximum area';
        const disabled = disabledReason != null;
        opts.push({
            kind: 'factor',
            factor,
            outW,
            outH,
            disabled,
            disabledReason,
            label: `${outW} × ${outH} (${formatFractionLabel(factor)})`,
        });
    });

    opts.push({ kind: 'other' });
    return opts;
}

function formatFractionLabel(factor) {
    const f = Number(factor);
    if (!Number.isFinite(f) || f <= 0) return '';
    if (f === 1) return '1/1';
    // Prefer clean integers (2,4,8...) as 1/N
    if (Number.isInteger(f)) return `1/${f}`;
    return `d=${f}`;
}
