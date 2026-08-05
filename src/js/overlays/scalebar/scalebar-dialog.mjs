import { domObjectFromHTML } from '../../utils/domObjectFromHTML.mjs';
import { syncNumericInputStep } from '../../utils/numericInputStep.mjs';

/**
 * @returns {string}
 */
export function buildScalebarDialogHTML() {
    return `<div class="scalebar-dialog hidden">
        <div class="sb-header">
            <div class="sb-title">Scalebar settings</div>
            <button class="sb-close" type="button" aria-label="Close">×</button>
        </div>
        <div class="sb-body">
            <div class="sb-mpp-warning hidden">Physical scale unavailable: tile source needs mpp (µm/px) metadata.</div>
            <div class="sb-row">
                <label class="sb-label" for="sb-height">Bar height</label>
                <input id="sb-height" class="sb-height" type="number" min="4" max="64" step="1" inputmode="numeric">
                <span class="sb-unit">px</span>
            </div>
            <div class="sb-row">
                <label class="sb-label" for="sb-font">Font size</label>
                <input id="sb-font" class="sb-font" type="number" min="8" max="48" step="1" inputmode="numeric">
                <span class="sb-unit">px</span>
            </div>
            <div class="sb-row">
                <label class="sb-label" for="sb-unit">Units</label>
                <select id="sb-unit" class="sb-unit-select">
                    <option value="mm">mm</option>
                    <option value="um">µm</option>
                </select>
            </div>
            <div class="sb-hint">Bar length updates automatically with zoom.</div>
        </div>
    </div>`;
}

/**
 * Create and return the dialog element (not yet appended).
 * @returns {HTMLElement}
 */
export function createScalebarDialogElement() {
    return domObjectFromHTML(buildScalebarDialogHTML());
}

const DIALOG_CSS = `
.scalebar-dialog {
    position: absolute;
    z-index: 100;
    top: 48px;
    right: 12px;
    width: min(280px, calc(100% - 24px));
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.18);
    font: 13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    color: #222;
}
.scalebar-dialog.hidden { display: none; }
.scalebar-dialog .sb-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: #eee;
    border-bottom: 1px solid #ddd;
}
.scalebar-dialog .sb-title { flex: 1; font-weight: 600; }
.scalebar-dialog .sb-close {
    border: none;
    background: transparent;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    padding: 0 4px;
}
.scalebar-dialog .sb-body { padding: 10px; display: grid; gap: 8px; }
.scalebar-dialog .sb-row { display: flex; align-items: center; gap: 8px; }
.scalebar-dialog .sb-label { min-width: 72px; }
.scalebar-dialog .sb-height,
.scalebar-dialog .sb-font {
    width: 72px;
    padding: 2px 4px;
}
.scalebar-dialog .sb-unit-select { flex: 1; padding: 2px 4px; }
.scalebar-dialog .sb-unit { color: #666; }
.scalebar-dialog .sb-hint { color: #666; font-size: 12px; }
.scalebar-dialog .sb-mpp-warning {
    background: #fff3cd;
    border: 1px solid #ffe69c;
    color: #664d03;
    padding: 6px 8px;
    border-radius: 3px;
    font-size: 12px;
}
.scalebar-dialog .sb-mpp-warning.hidden { display: none; }
`;

let cssInjected = false;

export function ensureScalebarDialogStyles() {
    if (cssInjected || typeof document === 'undefined') return;
    const existing = document.querySelector('style[data-osd-paperjs-scalebar-dialog]');
    if (existing) {
        cssInjected = true;
        return;
    }
    const style = document.createElement('style');
    style.setAttribute('data-osd-paperjs-scalebar-dialog', 'true');
    style.textContent = DIALOG_CSS;
    document.head.appendChild(style);
    cssInjected = true;
}

/**
 * Sync numeric inputs' step attributes from current values.
 * @param {HTMLElement} dialog
 */
export function syncScalebarDialogSteps(dialog) {
    if (!dialog) return;
    syncNumericInputStep(dialog.querySelector('.sb-height'));
    syncNumericInputStep(dialog.querySelector('.sb-font'));
}
