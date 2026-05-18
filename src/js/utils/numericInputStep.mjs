/** Default when input is empty (matches common 2-decimal defaults like 0.55). */
export const DEFAULT_NUMERIC_INPUT_STEP = 0.01;

/** Minimum step (matches FOV area max display precision). */
export const MIN_NUMERIC_INPUT_STEP = 1e-8;

/**
 * Step size from decimal places in the displayed string (not float internals).
 * @param {string} displayValue
 * @param {{ defaultStep?: number, minStep?: number }} [opts]
 * @returns {number}
 */
export function stepFromDisplayedValue(displayValue, opts = {}) {
    const defaultStep = opts.defaultStep ?? DEFAULT_NUMERIC_INPUT_STEP;
    const minStep = opts.minStep ?? MIN_NUMERIC_INPUT_STEP;
    const s = String(displayValue ?? '').trim();
    if (!s) return defaultStep;
    const dot = s.indexOf('.');
    if (dot === -1) return 1;
    const places = s.length - dot - 1;
    if (places <= 0) return 1;
    const step = 10 ** -places;
    return Math.max(step, minStep);
}

/**
 * Set input.step from current or provided display string.
 *
 * HTML constraint validation requires value === min + n * step. When using dynamic
 * step, keep input.min at 0 (or aligned with that grid); a positive min (e.g. 0.0001)
 * with step 0.1 makes values like 1.5 invalid (nearest become 1.4001 / 1.5001).
 *
 * @param {HTMLInputElement | null} input
 * @param {string} [displayValue] defaults to input.value
 */
export function syncNumericInputStep(input, displayValue) {
    if (!input) return;
    const s = displayValue !== undefined ? String(displayValue) : String(input.value ?? '');
    input.step = String(stepFromDisplayedValue(s));
}
