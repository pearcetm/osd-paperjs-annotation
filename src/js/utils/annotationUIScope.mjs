import {
    ANNOTATION_UI_STYLES_PENDING_CLASS,
    shouldHideAnnotationUIRootUntilStylesReady,
} from './annotationUIStyles.mjs';

/** CSS scope class for annotation UI styles (see docs/css-scoping.md). */
export const ANNOTATION_UI_SCOPE_CLASS = 'osd-paperjs-annotation';

/**
 * Outermost node for official toolbar/layer UI roots.
 * PostCSS rules are descendants of `.osd-paperjs-annotation`, not the same element.
 * @returns {HTMLDivElement}
 */
export function createAnnotationUIScopeRoot() {
    const root = document.createElement('div');
    root.classList.add(ANNOTATION_UI_SCOPE_CLASS);
    if (shouldHideAnnotationUIRootUntilStylesReady()) {
        root.classList.add(ANNOTATION_UI_STYLES_PENDING_CLASS);
    }
    return root;
}
