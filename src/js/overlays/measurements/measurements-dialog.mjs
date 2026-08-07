import { domObjectFromHTML } from '../../utils/domObjectFromHTML.mjs';
import { syncNumericInputStep } from '../../utils/numericInputStep.mjs';
import {
    ensureOverlayDialogStyles,
    OVERLAY_DIALOG_CLASS,
} from '../../utils/overlayDialog.mjs';

/**
 * @returns {string}
 */
export function buildMeasurementsDialogHTML() {
    return `<div class="measurements-overlay-dialog ${OVERLAY_DIALOG_CLASS} hidden" role="dialog" aria-label="Measurements">
        <div class="mo-row mo-ruler-row">
            <span class="mo-section-label">Ruler</span>
            <button type="button" class="mo-primary mo-new">New</button>
            <button type="button" class="mo-primary mo-cancel hidden">Cancel</button>
            <button type="button" class="mo-primary mo-done hidden">Done</button>
            <button type="button" class="mo-clear" disabled>Clear</button>
            <span class="mo-spacer"></span>
            <button type="button" class="mo-icon-btn mo-close" aria-label="Close" title="Close">×</button>
        </div>
        <div class="mo-row mo-scalebar-row">
            <span class="mo-section-label">Scalebar</span>
            <label class="mo-toggle" title="Show scalebar">
                <input type="checkbox" class="mo-scalebar-visible" aria-label="Show scalebar">
            </label>
            <span class="mo-spacer"></span>
            <select id="mo-unit" class="mo-unit-select"
                title="Display units for scalebar and ruler"
                aria-label="Display units for scalebar and ruler">
                <option value="mm">mm</option>
                <option value="um">µm</option>
            </select>
            <button type="button" class="mo-icon-btn mo-settings-toggle" aria-label="Settings" aria-expanded="false" title="Settings"></button>
        </div>
        <div class="mo-settings hidden">
            <div class="mo-mpp-warning hidden">Physical scale unavailable: tile source needs mpp (µm/px) metadata.</div>
            <div class="mo-settings-row mo-settings-row-decimals">
                <label class="mo-label" for="mo-decimals">Decimals</label>
                <input id="mo-decimals" class="mo-decimals" type="number" min="0" max="6" step="1" inputmode="numeric" title="Max decimal places for ruler labels">
            </div>
            <div class="mo-settings-row mo-settings-row-height">
                <label class="mo-label" for="mo-height">Bar height</label>
                <input id="mo-height" class="mo-height" type="number" min="4" max="64" step="1" inputmode="numeric">
                <span class="mo-unit">px</span>
            </div>
            <div class="mo-settings-row mo-settings-row-font">
                <label class="mo-label" for="mo-font">Font size</label>
                <input id="mo-font" class="mo-font" type="number" min="8" max="48" step="1" inputmode="numeric">
                <span class="mo-unit">px</span>
            </div>
            <div class="mo-hint">Bar height must be &gt;= font size + 2</div>
        </div>
    </div>`;
}

export function createMeasurementsDialogElement() {
    return domObjectFromHTML(buildMeasurementsDialogHTML());
}

/**
 * Show/hide feature sections and keep unit, gear, and close reachable.
 * @param {HTMLElement} dialog
 * @param {{ scalebar: boolean, ruler: boolean }} features
 */
export function applyMeasurementsDialogFeatures(dialog, features) {
    if (!dialog || !features) return;
    const { scalebar, ruler } = features;
    const rulerRow = dialog.querySelector('.mo-ruler-row');
    const scalebarRow = dialog.querySelector('.mo-scalebar-row');
    const unit = dialog.querySelector('.mo-unit-select');
    const gear = dialog.querySelector('.mo-settings-toggle');
    const close = dialog.querySelector('.mo-close');

    rulerRow?.classList.toggle('hidden', !ruler);
    scalebarRow?.classList.toggle('hidden', !scalebar);

    if (ruler && !scalebar && rulerRow && close) {
        if (unit) close.before(unit);
        if (gear) close.before(gear);
    } else if (scalebar && !ruler && scalebarRow && close) {
        scalebarRow.appendChild(close);
    }

    dialog.querySelector('.mo-settings-row-decimals')?.classList.toggle('hidden', !ruler);
    dialog.querySelector('.mo-settings-row-height')?.classList.toggle('hidden', !scalebar);
    dialog.querySelector('.mo-settings-row-font')?.classList.toggle('hidden', !scalebar);
    dialog.querySelector('.mo-hint')?.classList.toggle('hidden', !scalebar);
}

const DIALOG_CSS = `
.measurements-overlay-dialog {
    position: fixed;
    box-sizing: border-box;
    width: max-content;
    min-width: 12.5rem;
    max-width: min(280px, calc(100% - 16px));
    background: #fff;
    color: #111;
    border: 1px solid rgba(0,0,0,0.14);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px;
    line-height: 1.25;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.measurements-overlay-dialog.hidden { display: none; }
.measurements-overlay-dialog .mo-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: nowrap;
}
.measurements-overlay-dialog .mo-section-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: #666;
    text-transform: uppercase;
    flex: 0 0 auto;
}
.measurements-overlay-dialog .mo-spacer { flex: 1 1 auto; min-width: 4px; }
.measurements-overlay-dialog button {
    font: inherit;
    padding: 5px 10px;
    border: 1px solid rgba(0,0,0,0.18);
    background: #fff;
    border-radius: 8px;
    cursor: pointer;
}
.measurements-overlay-dialog button:hover:not(:disabled) { border-color: rgba(0,0,0,0.30); }
.measurements-overlay-dialog button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}
.measurements-overlay-dialog button.mo-primary {
    background: #111;
    color: #fff;
    border-color: #111;
}
.measurements-overlay-dialog .mo-new,
.measurements-overlay-dialog .mo-cancel,
.measurements-overlay-dialog .mo-done {
    width: 4.75rem;
    min-width: 4.75rem;
    box-sizing: border-box;
    text-align: center;
}
.measurements-overlay-dialog button.mo-primary:hover:not(:disabled) {
    background: #000;
    border-color: #000;
}
.measurements-overlay-dialog button.mo-icon-btn {
    border: none;
    background: transparent;
    padding: 4px;
    color: #666;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    min-width: 1.75rem;
    min-height: 1.75rem;
}
.measurements-overlay-dialog button.mo-icon-btn:hover {
    background: #f0f0f0;
    color: #111;
    border-color: transparent;
}
.measurements-overlay-dialog button.mo-close {
    font-size: 18px;
    padding: 2px 6px;
}
.measurements-overlay-dialog button.mo-settings-toggle svg.icon {
    width: 0.95em;
    height: 0.95em;
    display: block;
}
.measurements-overlay-dialog button.mo-settings-toggle[aria-expanded="true"] {
    background: #ececec;
    color: #111;
}
.measurements-overlay-dialog .mo-toggle {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    user-select: none;
    margin: 0;
}
.measurements-overlay-dialog .mo-unit-select {
    width: 4.25rem;
    flex: 0 0 auto;
    padding: 2px 4px;
    box-sizing: border-box;
}
.measurements-overlay-dialog .mo-settings {
    display: grid;
    gap: 8px;
    padding-top: 4px;
    border-top: 1px solid rgba(0,0,0,0.08);
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
}
.measurements-overlay-dialog .mo-settings.hidden { display: none; }
.measurements-overlay-dialog .mo-settings-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}
.measurements-overlay-dialog .mo-label { min-width: 4.75rem; flex: 0 0 auto; }
.measurements-overlay-dialog .mo-height,
.measurements-overlay-dialog .mo-font,
.measurements-overlay-dialog .mo-decimals {
    width: 4.25rem;
    flex: 0 0 auto;
    padding: 2px 4px;
    box-sizing: border-box;
}
.measurements-overlay-dialog .mo-unit { color: #666; }
.measurements-overlay-dialog .mo-hint {
    color: #666;
    font-size: 12px;
    min-width: 0;
    overflow-wrap: anywhere;
}
.measurements-overlay-dialog .mo-mpp-warning {
    background: #fff3cd;
    border: 1px solid #ffe69c;
    color: #664d03;
    padding: 6px 8px;
    border-radius: 3px;
    font-size: 12px;
    min-width: 0;
    overflow-wrap: anywhere;
}
.measurements-overlay-dialog .mo-mpp-warning.hidden { display: none; }
.measurements-overlay-dialog .hidden { display: none !important; }
`;

let cssInjected = false;

export function ensureMeasurementsDialogStyles() {
    ensureOverlayDialogStyles();
    if (cssInjected || typeof document === 'undefined') return;
    const existing = document.querySelector('style[data-osd-paperjs-measurements-dialog]');
    if (existing) {
        // Keep stylesheet in sync when dialog CSS changes (HMR / re-import).
        existing.textContent = DIALOG_CSS;
        cssInjected = true;
        return;
    }
    const style = document.createElement('style');
    style.setAttribute('data-osd-paperjs-measurements-dialog', 'true');
    style.textContent = DIALOG_CSS;
    document.head.appendChild(style);
    cssInjected = true;
}

/**
 * @param {HTMLElement} dialog
 */
export function syncMeasurementsDialogSteps(dialog) {
    if (!dialog) return;
    syncNumericInputStep(dialog.querySelector('.mo-height'));
    syncNumericInputStep(dialog.querySelector('.mo-font'));
    syncNumericInputStep(dialog.querySelector('.mo-decimals'));
}
