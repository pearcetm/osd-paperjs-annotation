import { domObjectFromHTML } from '../../utils/domObjectFromHTML.mjs';
import { syncNumericInputStep } from '../../utils/numericInputStep.mjs';
import {
    ensureOverlayDialogStyles,
    OVERLAY_DIALOG_CARD_CLASS,
    OVERLAY_DIALOG_CLASS,
} from '../../utils/overlayDialog.mjs';

/**
 * @returns {string}
 */
export function buildScalebarDialogHTML() {
    return `<div class="scalebar-dialog ${OVERLAY_DIALOG_CLASS} ${OVERLAY_DIALOG_CARD_CLASS} hidden">
        <div class="sb-header osd-overlay-dialog-header">
            <div class="sb-title osd-overlay-dialog-title">Scalebar settings</div>
            <button class="sb-close osd-overlay-dialog-close" type="button" aria-label="Close">×</button>
        </div>
        <div class="sb-body osd-overlay-dialog-body">
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
    width: min(320px, calc(100% - 24px));
}
.scalebar-dialog .sb-body { display: grid; gap: 8px; }
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
    ensureOverlayDialogStyles();
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
