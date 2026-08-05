/**
 * Routes sparse pointer interactions through stacked PaperOverlays.
 *
 * Offers are evaluated in visual front-to-back order. Returning `claim` consumes
 * the DOM event; `decline` and `miss` both allow lower overlays to inspect it.
 */

export const OVERLAY_POINTER_CLAIM = 'claim';
export const OVERLAY_POINTER_DECLINE = 'decline';
export const OVERLAY_POINTER_MISS = 'miss';

export class OverlayPointerRouter {
    /**
     * @param {OpenSeadragon.Viewer} viewer
     */
    constructor(viewer) {
        this.viewer = viewer;
        this._registrations = [];
        this._listeners = new Map();
        this._destroyed = false;

        viewer.addOnceHandler?.('destroy', () => this.destroy());
    }

    /**
     * @param {import('../paper-overlay.mjs').PaperOverlay} overlay
     * @param {string} eventType
     * @param {(event: Event) => 'claim'|'decline'|'miss'} offer
     * @returns {() => void} unregister function
     */
    register(overlay, eventType, offer) {
        if (this._destroyed) {
            throw new Error('Cannot register with a destroyed OverlayPointerRouter.');
        }
        if (!overlay || typeof eventType !== 'string' || typeof offer !== 'function') {
            throw new TypeError('OverlayPointerRouter.register requires an overlay, event type, and offer function.');
        }

        const registration = { overlay, eventType, offer };
        this._registrations.push(registration);
        this._ensureListener(eventType);

        let registered = true;
        return () => {
            if (!registered) return;
            registered = false;
            const index = this._registrations.indexOf(registration);
            if (index >= 0) this._registrations.splice(index, 1);
            this._removeUnusedListener(eventType);
        };
    }

    _ensureListener(eventType) {
        if (this._listeners.has(eventType)) return;
        const listener = (event) => this._dispatch(eventType, event);
        this.viewer.container.addEventListener(eventType, listener, true);
        this._listeners.set(eventType, listener);
    }

    _removeUnusedListener(eventType) {
        if (this._registrations.some((registration) => registration.eventType === eventType)) return;
        const listener = this._listeners.get(eventType);
        if (!listener) return;
        this.viewer.container.removeEventListener(eventType, listener, true);
        this._listeners.delete(eventType);
    }

    _dispatch(eventType, event) {
        if (this._destroyed || !this.viewer.canvas?.contains(event.target)) return;

        const overlays = this.viewer.PaperOverlays || [];
        const offers = this._registrations
            .filter((registration) => registration.eventType === eventType)
            .map((registration, order) => ({
                ...registration,
                order,
                overlayIndex: overlays.indexOf(registration.overlay),
            }))
            .filter((registration) => registration.overlayIndex >= 0)
            .sort((a, b) => b.overlayIndex - a.overlayIndex || b.order - a.order);

        for (const registration of offers) {
            const result = registration.offer(event);
            if (result !== OVERLAY_POINTER_CLAIM) continue;
            event.preventDefault();
            event.stopPropagation();
            return;
        }
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        for (const [eventType, listener] of this._listeners) {
            this.viewer.container.removeEventListener(eventType, listener, true);
        }
        this._listeners.clear();
        this._registrations.length = 0;
    }
}

/**
 * Return the viewer-scoped router, creating it on first use.
 * @param {OpenSeadragon.Viewer} viewer
 * @returns {OverlayPointerRouter}
 */
export function getOverlayPointerRouter(viewer) {
    if (!viewer.overlayPointerRouter) {
        viewer.overlayPointerRouter = new OverlayPointerRouter(viewer);
    }
    return viewer.overlayPointerRouter;
}
