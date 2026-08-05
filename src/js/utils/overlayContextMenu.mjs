/**
 * Cursor-local context menus for overlay chrome (scalebar, FOV rings, etc.).
 * Auto-dismisses on outside pointerdown, Escape, blur, and viewer-container scroll.
 */

const MENU_CLASS = 'osd-overlay-context-menu';

const MENU_CSS = `
position:fixed;z-index:100000;background:#fff;border:1px solid rgba(0,0,0,0.15);
border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.18);min-width:12rem;padding:4px 0;
font:13px system-ui,-apple-system,sans-serif;
`;

const ROW_CSS =
    'display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:transparent;' +
    'cursor:pointer;font:inherit;color:#111;';

/** @type {null | (() => void)} */
let activeDismiss = null;

/**
 * Dismiss any open overlay context menu created by this helper.
 */
export function dismissOverlayContextMenu() {
    if (activeDismiss) {
        activeDismiss();
    }
}

/**
 * @typedef {object} OverlayContextMenuItem
 * @property {string} label
 * @property {() => void} onClick
 */

/**
 * Open a fixed-position context menu at the cursor.
 *
 * @param {object} opts
 * @param {number} opts.clientX
 * @param {number} opts.clientY
 * @param {OverlayContextMenuItem[]} opts.items
 * @param {OpenSeadragon.Viewer} [opts.viewer] Used for scroll-dismiss on viewer.container
 * @param {string|HTMLElement|null} [opts.header] Optional non-interactive header above items
 * @returns {() => void} dismiss function
 */
export function openOverlayContextMenu({ clientX, clientY, items, viewer = null, header = null }) {
    dismissOverlayContextMenu();

    const wrap = document.createElement('div');
    wrap.className = MENU_CLASS;
    wrap.setAttribute('role', 'menu');
    wrap.style.cssText = MENU_CSS;

    if (header) {
        let headerEl;
        if (typeof header === 'string') {
            headerEl = document.createElement('div');
            headerEl.textContent = header;
            headerEl.style.cssText =
                'padding:8px 12px 6px 12px;color:rgba(0,0,0,0.70);font:12px system-ui,-apple-system,sans-serif;line-height:1.25;white-space:pre-line;';
        } else {
            headerEl = header;
        }
        wrap.appendChild(headerEl);
        const sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:rgba(0,0,0,0.08);margin:4px 0;';
        wrap.appendChild(sep);
    }

    const hoverOn = (b) => {
        b.style.background = 'rgba(0,0,0,0.06)';
    };
    const hoverOff = (b) => {
        b.style.background = 'transparent';
    };

    for (const item of items || []) {
        if (!item?.label || typeof item.onClick !== 'function') continue;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'menuitem');
        btn.textContent = item.label;
        btn.style.cssText = ROW_CSS;
        btn.addEventListener('mouseenter', () => hoverOn(btn));
        btn.addEventListener('mouseleave', () => hoverOff(btn));
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dismiss();
            item.onClick();
        });
        wrap.appendChild(btn);
    }

    document.body.appendChild(wrap);

    const rect = wrap.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = clientX;
    let top = clientY;
    if (left + rect.width > vw - 8) left = vw - rect.width - 8;
    if (top + rect.height > vh - 8) top = vh - rect.height - 8;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    wrap.style.left = `${left}px`;
    wrap.style.top = `${top}px`;

    const onPointerDown = (e) => {
        if (wrap.contains(e.target)) return;
        dismiss();
    };
    const onKeyDown = (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        dismiss();
    };
    const onBlur = () => dismiss();
    const onScroll = () => dismiss();

    let dismissed = false;
    const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        if (activeDismiss === dismiss) activeDismiss = null;
        wrap.remove();
        document.removeEventListener('pointerdown', onPointerDown, true);
        window.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('blur', onBlur);
        viewer?.container?.removeEventListener('scroll', onScroll, true);
    };

    activeDismiss = dismiss;

    setTimeout(() => {
        if (dismissed) return;
        document.addEventListener('pointerdown', onPointerDown, true);
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('blur', onBlur);
        viewer?.container?.addEventListener('scroll', onScroll, true);
    }, 0);

    return dismiss;
}
