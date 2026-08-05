/**
 * Shared look and stacking policy for overlay dialogs appended to `viewer.container`.
 *
 * Dialogs carry OVERLAY_DIALOG_CLASS so that AnnotationUITool#raiseCanvasZIndex can lift the
 * viewer canvas above toolbars without burying them; see nextCanvasZIndex.
 */

/** Marker class: container-level dialog that must stay above the viewer canvas. */
export const OVERLAY_DIALOG_CLASS = 'osd-overlay-dialog';

/** Shared centered card presentation for overlay dialogs. */
export const OVERLAY_DIALOG_CARD_CLASS = 'osd-overlay-dialog-card';

/** Stacking band for marked dialogs. */
export const OVERLAY_DIALOG_Z_INDEX = 10000;

const STYLE_ATTRIBUTE = 'data-osd-overlay-dialog';

const OVERLAY_DIALOG_CSS = `
.${OVERLAY_DIALOG_CLASS} {
    z-index: ${OVERLAY_DIALOG_Z_INDEX};
}
.${OVERLAY_DIALOG_CARD_CLASS} {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    box-sizing: border-box;
    max-height: calc(100% - 24px);
    overflow: auto;
    background: #fff;
    color: #111;
    border: 1px solid rgba(0,0,0,0.14);
    border-radius: 10px;
    box-shadow: 0 14px 40px rgba(0,0,0,0.22);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px;
    line-height: 1.25;
}
.${OVERLAY_DIALOG_CARD_CLASS}.hidden {
    display: none;
}
.${OVERLAY_DIALOG_CARD_CLASS} .osd-overlay-dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    position: sticky;
    top: 0;
    background: #fff;
    z-index: 1;
}
.${OVERLAY_DIALOG_CARD_CLASS} .osd-overlay-dialog-title {
    font-weight: 600;
    font-size: 14px;
}
.${OVERLAY_DIALOG_CARD_CLASS} .osd-overlay-dialog-close {
    border: none;
    background: transparent;
    font-size: 18px;
    line-height: 1;
    padding: 2px 6px;
    border-radius: 4px;
    color: #666;
    cursor: pointer;
}
.${OVERLAY_DIALOG_CARD_CLASS} .osd-overlay-dialog-close:hover {
    background: #f0f0f0;
    color: #111;
}
.${OVERLAY_DIALOG_CARD_CLASS} .osd-overlay-dialog-body {
    padding: 10px 12px;
}
`;

let cssInjected = false;

/**
 * Inject the shared dialog stylesheet once per document.
 */
export function ensureOverlayDialogStyles() {
    if (cssInjected || typeof document === 'undefined') return;
    if (document.querySelector(`style[${STYLE_ATTRIBUTE}]`)) {
        cssInjected = true;
        return;
    }
    const style = document.createElement('style');
    style.setAttribute(STYLE_ATTRIBUTE, 'true');
    style.textContent = OVERLAY_DIALOG_CSS;
    document.head.appendChild(style);
    cssInjected = true;
}

/**
 * @param {Element} element
 * @returns {boolean} Whether the element is a marked overlay dialog.
 */
export function isOverlayDialogElement(element) {
    return Boolean(element?.classList?.contains(OVERLAY_DIALOG_CLASS));
}

/**
 * Lowest z-index that stacks above every supplied computed z-index value.
 * @param {Array<string|number|null|undefined>} zIndexValues Computed 'z-index' values ('auto' allowed).
 * @returns {number}
 */
export function nextCanvasZIndex(zIndexValues) {
    let max = 0;
    for (const value of zIndexValues || []) {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed > max) {
            max = parsed;
        }
    }
    return max + 1;
}
