/**
 * Primary-contact checks for tool / overlay pointer gating.
 * Pointer Events model + TouchEvent fallback (Paper.js 0.12 touch path and 0.17 mobile).
 */

/**
 * @param {Event|null|undefined} nativeEvent
 * @returns {boolean}
 */
export function nativeEventIsPrimaryDownOrUp(nativeEvent) {
    if (!nativeEvent) return false;
    // Multi-touch: ignore non-primary pointers when the property exists (PointerEvent).
    if (nativeEvent.isPrimary === false) return false;
    // Mouse / PointerEvent: left button and touch/pen contact are button === 0.
    if (typeof nativeEvent.button === 'number') return nativeEvent.button === 0;
    // Paper.js 0.17 (and 0.12 touch fallback): raw TouchEvent has no button.
    if (nativeEvent.touches || nativeEvent.changedTouches) return true;
    return false;
}

/**
 * @param {Event|null|undefined} nativeEvent
 * @returns {boolean}
 */
export function nativeEventIsPrimaryActiveDrag(nativeEvent) {
    if (!nativeEvent) return false;
    if (nativeEvent.isPrimary === false) return false;
    if (typeof nativeEvent.buttons === 'number') return (nativeEvent.buttons & 1) === 1;
    if (nativeEvent.touches && nativeEvent.touches.length > 0) return true;
    return false;
}

/**
 * Paper.js tool events expose the native DOM event as `event`.
 * @param {Object} ev - Paper ToolEvent or compatible
 * @returns {boolean}
 */
export function annotationToolPrimaryButtonDownOrUp(ev) {
    return nativeEventIsPrimaryDownOrUp(ev && ev.event);
}

/**
 * @param {Object} ev - Paper ToolEvent or compatible
 * @returns {boolean}
 */
export function annotationToolPrimaryButtonActiveDrag(ev) {
    return nativeEventIsPrimaryActiveDrag(ev && ev.event);
}
