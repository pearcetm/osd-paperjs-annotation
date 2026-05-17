/**
 * Annotation UI stylesheet loading.
 *
 * Styles load when the first toolbar or layer UI is created — i.e. when
 * `AnnotationToolkit#getToolbar()` or `#getLayerUI()` runs. Other UI setup
 * paths must go through those factories.
 *
 * Native ESM (demos importing `src/js/*.mjs`): `addCSS()` injects `<link>` tags.
 * Official toolbar/layer scope roots stay hidden until both sheets load.
 * Webpack (`dist/main.js`): `addcss.mjs` is wired to `importcss.mjs` via
 * imports-loader; do not import `importcss.mjs` here (browsers cannot load `.css`
 * as module scripts).
 */

import { addCSS } from './addcss.mjs';

/** Class on official toolbar/layer scope roots until UI stylesheets have loaded (native ESM). */
export const ANNOTATION_UI_STYLES_PENDING_CLASS = 'annotation-ui-styles-pending';

const GUARD_STYLE_ID = 'osd-paperjs-annotation-ui-styles-guard';
const nativeESM = typeof importedCSS === 'undefined';

let injectStarted = false;
let stylesReady = !nativeESM;
let stylesReadyPromise = null;

function ensureLoadingGuardStyle() {
    if (document.getElementById(GUARD_STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = GUARD_STYLE_ID;
    style.setAttribute('data-osd-paperjs-annotation', 'true');
    style.textContent =
        `.osd-paperjs-annotation.${ANNOTATION_UI_STYLES_PENDING_CLASS}{visibility:hidden}`;
    document.head.appendChild(style);
}

/**
 * @param {HTMLLinkElement|null|undefined} link
 * @returns {Promise<void>}
 */
function waitForStylesheetLink(link) {
    if (!link) {
        return Promise.resolve();
    }
    try {
        if (link.sheet) {
            return Promise.resolve();
        }
    } catch {
        // Cross-origin stylesheets may throw when reading .sheet before load.
    }
    return new Promise((resolve) => {
        const done = () => resolve();
        link.addEventListener('load', done, { once: true });
        link.addEventListener('error', done, { once: true });
    });
}

function revealPendingAnnotationUIRoots() {
    document
        .querySelectorAll(`.${ANNOTATION_UI_STYLES_PENDING_CLASS}`)
        .forEach((el) => el.classList.remove(ANNOTATION_UI_STYLES_PENDING_CLASS));
}

/**
 * Whether new official toolbar/layer scope roots should be hidden until styles load.
 * @returns {boolean}
 */
export function shouldHideAnnotationUIRootUntilStylesReady() {
    return nativeESM && !stylesReady;
}

/**
 * Idempotent. Injects scoped UI styles via link tags (native ESM) or no-ops when
 * webpack has already injected them through importcss.
 */
export function ensureAnnotationUIStyles() {
    if (injectStarted) {
        return;
    }
    injectStarted = true;
    if (!nativeESM) {
        return;
    }
    ensureLoadingGuardStyle();
    const links = [
        addCSS('annotationui.css', 'annotationui'),
        addCSS('editablecontent.css', 'editablecontent'),
    ];
    stylesReadyPromise = Promise.all(links.map(waitForStylesheetLink)).then(() => {
        stylesReady = true;
        revealPendingAnnotationUIRoots();
    });
}

/**
 * Resolves when annotation UI styles are available (native ESM: both link sheets loaded).
 * @returns {Promise<void>}
 */
export function annotationUIStylesReady() {
    ensureAnnotationUIStyles();
    if (stylesReady) {
        return Promise.resolve();
    }
    return stylesReadyPromise ?? Promise.resolve();
}
