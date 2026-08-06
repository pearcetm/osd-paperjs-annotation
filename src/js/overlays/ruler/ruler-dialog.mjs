import { domObjectFromHTML } from '../../utils/domObjectFromHTML.mjs';
import {
    ensureOverlayDialogStyles,
    OVERLAY_DIALOG_CLASS,
} from '../../utils/overlayDialog.mjs';

/**
 * @returns {string}
 */
export function buildRulerOverlayDialogHTML() {
    return `<div class="ruler-overlay-dialog ${OVERLAY_DIALOG_CLASS} hidden" role="dialog" aria-label="Measurements">
        <div class="ro-compact-bar">
            <button type="button" class="ro-primary ro-new">New</button>
            <button type="button" class="ro-primary ro-done hidden">Done</button>
            <button type="button" class="ro-clear" disabled>Clear</button>
            <span class="ro-spacer"></span>
            <button type="button" class="ro-close" aria-label="Close">×</button>
        </div>
    </div>`;
}

export function createRulerOverlayDialogElement() {
    return domObjectFromHTML(buildRulerOverlayDialogHTML());
}

const DIALOG_CSS = `
.ruler-overlay-dialog {
    position: fixed;
    box-sizing: border-box;
    width: auto;
    min-width: 11rem;
    max-width: min(320px, calc(100% - 16px));
    background: #fff;
    color: #111;
    border: 1px solid rgba(0,0,0,0.14);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px;
    line-height: 1.25;
}
.ruler-overlay-dialog.hidden { display: none; }
.ruler-overlay-dialog .ro-compact-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    flex-wrap: wrap;
}
.ruler-overlay-dialog .ro-spacer { flex: 1 1 auto; min-width: 4px; }
.ruler-overlay-dialog button {
    font: inherit;
    padding: 5px 10px;
    border: 1px solid rgba(0,0,0,0.18);
    background: #fff;
    border-radius: 8px;
    cursor: pointer;
}
.ruler-overlay-dialog button:hover:not(:disabled) { border-color: rgba(0,0,0,0.30); }
.ruler-overlay-dialog button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}
.ruler-overlay-dialog button.ro-primary {
    background: #111;
    color: #fff;
    border-color: #111;
}
.ruler-overlay-dialog button.ro-primary:hover:not(:disabled) {
    background: #000;
    border-color: #000;
}
.ruler-overlay-dialog button.ro-close {
    border: none;
    background: transparent;
    font-size: 18px;
    line-height: 1;
    padding: 2px 6px;
    color: #666;
}
.ruler-overlay-dialog button.ro-close:hover { background: #f0f0f0; color: #111; }
.ruler-overlay-dialog .hidden { display: none !important; }
`;

let cssInjected = false;

export function ensureRulerOverlayDialogStyles() {
    ensureOverlayDialogStyles();
    if (cssInjected || typeof document === 'undefined') return;
    if (document.querySelector('style[data-osd-paperjs-ruler-overlay-dialog]')) {
        cssInjected = true;
        return;
    }
    const style = document.createElement('style');
    style.setAttribute('data-osd-paperjs-ruler-overlay-dialog', 'true');
    style.textContent = DIALOG_CSS;
    document.head.appendChild(style);
    cssInjected = true;
}
