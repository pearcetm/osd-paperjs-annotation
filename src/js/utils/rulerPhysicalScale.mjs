/**
 * Sync ruler toolbar physical scale from tiled-image mpp (µm/px).
 * Ruler displays `paperDistance * unitsPerPixel` + labelUnit; do not pass µm/px as unitsPerPixel.
 */

/**
 * @param {OSDPaperjsAnnotation.AnnotationToolkit} toolkit
 * @param {Object|null} mpp - Microns per source pixel `{ x, y }` (isotropic +X uses `mpp.x`)
 * @param {Object} [options]
 * @param {string} [options.unit] - Display unit: `'mm'` (default) or `'um'`
 * @returns {boolean} true if ruler toolbar was updated
 */
export function applyRulerPhysicalScaleFromMpp(toolkit, mpp, options = {}) {
    if (!mpp || !Number.isFinite(mpp.x) || mpp.x <= 0) return false;
    const ruler = toolkit.getTool?.('ruler');
    const tc = ruler?.getToolbarControl?.();
    if (!tc) return false;

    const unit = options.unit ?? 'mm';
    const mmPerPx = mpp.x / 1000;
    const unitsPerPixel = unit === 'um' ? mpp.x : mmPerPx;
    const labelUnit = unit === 'um' ? 'um' : 'mm';

    tc.labelUnit = labelUnit;
    tc.unitsPerPixel = unitsPerPixel;
    if (tc.unitsInput) tc.unitsInput.value = labelUnit;
    if (tc.unitsPerPixelInput) tc.unitsPerPixelInput.value = String(unitsPerPixel);

    const lm = ruler._lastMeasurement;
    tc.updateMeasurement(lm?.p1 ?? null, lm?.p2 ?? null, lm?.distance ?? null);
    ruler.refreshSegmentLabels?.();
    return true;
}
