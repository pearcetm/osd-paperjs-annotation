/**
 * Viewer-fixed scalebar engine (chrome only).
 * Black bar + white length label, bottom-right; length tracks zoom via nice-length policy.
 *
 * Driven by MeasurementsOverlay — no toolbar button or settings dialog of its own.
 * States: inactive | showing
 */

import { OpenSeadragon } from '../../osd-loader.mjs';
import { PaperOverlay } from '../../paper-overlay.mjs';
import { paper } from '../../paperjs.mjs';
import { mppFromActiveViewerImage } from '../../utils/mpp.mjs';
import { dismissOverlayContextMenu, openOverlayContextMenu } from '../../utils/overlayContextMenu.mjs';
import { ViewerOverlayBase } from '../base.mjs';
import {
    getOverlayPointerRouter,
    OVERLAY_POINTER_CLAIM,
    OVERLAY_POINTER_MISS,
} from '../overlay-pointer-router.mjs';
import {
    bottomRightBarRect,
    computeSmartScalebarLengthUm,
    formatScalebarLabel,
    physicalUmToScreenPx,
} from './scalebar-geometry.mjs';
import {
    loadScalebarSettings,
    normalizeScalebarSettings,
    saveScalebarSettings,
} from './scalebar-settings.mjs';

const PADDING_PX = 12;

/**
 * @class
 * @memberof OSDPaperjsAnnotation
 */
class ScalebarOverlay extends ViewerOverlayBase {
    static get label() { return 'Scalebar'; }
    static get faIconClass() { return 'fa-ruler-horizontal'; }

    /**
     * @param {OpenSeadragon.Viewer} viewer
     * @param {Object} [opts]
     * @param {'showing'} [opts.startIn] Host default-on chrome without opening the panel
     * @param {Object} [opts.host] Facade callbacks from MeasurementsOverlay
     * @param {() => boolean} [opts.host.isPanelOpen]
     * @param {(opts?: { expandSettings?: boolean }) => void} [opts.host.openPanel]
     * @param {() => void} [opts.host.closePanel]
     * @param {() => void} [opts.host.onScalebarVisibilityChange]
     */
    constructor(viewer, opts = {}) {
        super(viewer, { ...opts, registerWithConfig: false, showButton: false });

        this._host = opts.host || null;

        this.overlay = new PaperOverlay(viewer, { overlayType: 'viewer' });
        this.overlay.setPointerEventsEnabled(false);
        this.settings = loadScalebarSettings();
        this._saveSettingsTimeout = null;
        this._bar = null;
        this._label = null;
        this._group = null;
        this._destroyed = false;
        this._state = 'inactive';

        this._ensurePaperItems();
        this._setBarVisible(false);

        this._onRedraw = () => this._redraw();
        this._onOpen = () => this._redraw();
        this._onWorldChange = () => this._redraw();

        viewer.addHandler('animation', this._onRedraw);
        viewer.addHandler('animation-finish', this._onRedraw);
        viewer.addHandler('resize', this._onRedraw);
        viewer.addHandler('open', this._onOpen);
        viewer.addHandler('page', this._onOpen);
        viewer.world?.addHandler?.('add-item', this._onWorldChange);
        viewer.world?.addHandler?.('remove-item', this._onWorldChange);

        this._unregisterContextMenu = getOverlayPointerRouter(viewer).register(
            this.overlay,
            'contextmenu',
            (ev) => this._offerContextMenu(ev),
        );

        if (opts.startIn === 'showing') {
            this.show();
        }
    }

    /**
     * Show the scalebar chrome (same as show for the engine).
     */
    activate() {
        this.show();
    }

    /**
     * Hide the scalebar chrome.
     */
    deactivate() {
        dismissOverlayContextMenu();
        this._setActive(false);
        this._setState('inactive');
        this._host?.onScalebarVisibilityChange?.();
    }

    /**
     * Host helper: show bar without opening the measurements panel.
     */
    show() {
        this._setActive(true);
        this._setState('showing');
        this._host?.onScalebarVisibilityChange?.();
    }

    /** @returns {boolean} Whether the scalebar is intended to be shown (may be temporarily hidden without mpp). */
    isVisible() {
        return this._active && this._state !== 'inactive';
    }

    /**
     * @param {boolean} visible
     */
    setVisible(visible) {
        if (visible) this.show();
        else this.deactivate();
    }

    /** @returns {{ heightPx: number, fontPx: number, unit: string }} */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * @param {Object} partial
     */
    applySettings(partial) {
        this.settings = normalizeScalebarSettings({ ...this.settings, ...partial }, this.settings);
        this._scheduleSaveSettings();
        this._redraw();
    }

    /** @returns {boolean} */
    hasMpp() {
        return Boolean(mppFromActiveViewerImage(this.viewer));
    }

    /**
     * Open a cursor-local menu when the right-click lands on the bar; otherwise ignore.
     * @param {MouseEvent} ev
     */
    _offerContextMenu(ev) {
        if (this._destroyed || !this._active || !this._group?.visible || !this._host) {
            return OVERLAY_POINTER_MISS;
        }

        const view = this.overlay.paperScope.view;
        const viewEl = view.element;
        const rect = viewEl.getBoundingClientRect();
        const point = view.viewToProject(new paper.Point(ev.clientX - rect.left, ev.clientY - rect.top));
        const hit = this._group.hitTest(point, { fill: true, stroke: true, tolerance: 4 });
        if (!hit) return OVERLAY_POINTER_MISS;

        const panelOpen = !!this._host.isPanelOpen?.();
        openOverlayContextMenu({
            clientX: ev.clientX,
            clientY: ev.clientY,
            viewer: this.viewer,
            items: [
                {
                    label: panelOpen ? 'Close Measurements' : 'Open Measurements',
                    onClick: () => {
                        if (panelOpen) this._host.closePanel?.();
                        else this._host.openPanel?.({ expandSettings: true });
                    },
                },
                {
                    label: 'Hide Scalebar',
                    onClick: () => this.setVisible(false),
                },
            ],
        });
        return OVERLAY_POINTER_CLAIM;
    }

    /**
     * @param {'inactive'|'showing'} next
     */
    _setState(next) {
        this._state = next;

        if (next === 'inactive') {
            this._setBarVisible(false);
            return;
        }

        this._setBarVisible(true);
        this._redraw();
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;

        if (this._saveSettingsTimeout) {
            clearTimeout(this._saveSettingsTimeout);
            this._saveSettingsTimeout = null;
        }

        this.viewer.removeHandler('animation', this._onRedraw);
        this.viewer.removeHandler('animation-finish', this._onRedraw);
        this.viewer.removeHandler('resize', this._onRedraw);
        this.viewer.removeHandler('open', this._onOpen);
        this.viewer.removeHandler('page', this._onOpen);
        this.viewer.world?.removeHandler?.('add-item', this._onWorldChange);
        this.viewer.world?.removeHandler?.('remove-item', this._onWorldChange);
        this._unregisterContextMenu?.();
        this._unregisterContextMenu = null;
        dismissOverlayContextMenu();

        if (this._group) {
            this._group.remove();
            this._group = null;
            this._bar = null;
            this._label = null;
        }

        try {
            this.overlay?.destroy?.();
        } catch {
            /* ignore */
        }

        super.destroy();
    }

    _scheduleSaveSettings() {
        if (this._saveSettingsTimeout) clearTimeout(this._saveSettingsTimeout);
        this._saveSettingsTimeout = setTimeout(() => {
            this._saveSettingsTimeout = null;
            saveScalebarSettings(this.settings);
        }, 200);
    }

    _ensurePaperItems() {
        const scope = this.overlay.paperScope;
        scope.activate();
        if (this._group) return;

        this._group = new paper.Group();
        this._group.name = 'scalebar';
        this._group.applyMatrix = false;

        this._bar = new paper.Path.Rectangle(new paper.Rectangle(0, 0, 10, 10));
        this._bar.fillColor = '#000';
        this._bar.strokeWidth = 0;

        this._label = new paper.PointText({
            content: '',
            fillColor: '#fff',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            fontSize: this.settings.fontPx,
            justification: 'center',
        });

        this._group.addChildren([this._bar, this._label]);
        scope.project.activeLayer.addChild(this._group);
    }

    _setBarVisible(visible) {
        if (this._group) {
            this._group.visible = Boolean(visible);
            this.overlay.paperScope.view.update();
        }
    }

    /**
     * Viewer-element pixels per source image pixel along X at the current zoom.
     * @returns {number}
     */
    _screenPxPerImagePx() {
        const item = this.viewer.world?.getItemAt?.(0);
        if (!item || typeof item.imageToViewerElementCoordinates !== 'function') return NaN;
        const p0 = item.imageToViewerElementCoordinates(new OpenSeadragon.Point(0, 0));
        const p1 = item.imageToViewerElementCoordinates(new OpenSeadragon.Point(1, 0));
        if (!p0 || !p1) return NaN;
        const dx = Math.abs(p1.x - p0.x);
        return dx > 0 ? dx : NaN;
    }

    _redraw() {
        if (this._destroyed || !this._active) return;
        this._ensurePaperItems();

        const mpp = mppFromActiveViewerImage(this.viewer);
        const scope = this.overlay.paperScope;
        const vw = scope.view.viewSize.width;
        const vh = scope.view.viewSize.height;
        const screenPxPerImagePx = this._screenPxPerImagePx();

        if (!mpp || !Number.isFinite(screenPxPerImagePx)) {
            this._group.visible = false;
            scope.view.update();
            return;
        }

        const lengthUm = computeSmartScalebarLengthUm({
            mppX: mpp.x,
            viewportWidthPx: vw,
            screenPxPerImagePx,
        });
        if (lengthUm == null) {
            this._group.visible = false;
            scope.view.update();
            return;
        }

        const barWidthPx = Math.max(1, Math.round(physicalUmToScreenPx(lengthUm, mpp.x, screenPxPerImagePx)));
        const barHeightPx = this.settings.heightPx;
        const rect = bottomRightBarRect({
            viewportWidth: vw,
            viewportHeight: vh,
            barWidthPx,
            barHeightPx,
            paddingPx: PADDING_PX,
        });

        this._bar.bounds = new paper.Rectangle(rect.x, rect.y, rect.width, rect.height);
        this._label.fontSize = this.settings.fontPx;
        this._label.content = formatScalebarLabel(lengthUm, this.settings.unit);
        this._label.position = new paper.Point(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
        );

        const labelWidth = this._label.bounds.width;
        const fits = labelWidth <= (rect.width - 6) && this.settings.fontPx <= (rect.height - 2);
        this._label.visible = fits;

        this._group.visible = true;
        scope.view.update();
    }
}

export { ScalebarOverlay };
