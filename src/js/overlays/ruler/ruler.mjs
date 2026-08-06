/**
 * Convenience ruler overlay: FOV-style session with under-toolbar compact dialog.
 * States: inactive | config | measuring
 *
 * Headless mode (`opts.headless`): no toolbar button/dialog/Esc — driven by MeasurementsOverlay.
 */

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
    createRulerOverlayDialogElement,
    ensureRulerOverlayDialogStyles,
} from './ruler-dialog.mjs';
import { findViewerRulerRoot, refreshSegmentLabel, VIEWER_RULER_KIND } from './ruler-segment.mjs';
import { RulerOverlayTool } from './ruler-tool.mjs';

function ensureNamedToolLayer(paperScope) {
    if (paperScope.project.layers.toolLayer) return;
    const toolLayer = new paperScope.Layer();
    toolLayer.isGeoJSONFeatureCollection = false;
    toolLayer.name = 'toolLayer';
    toolLayer.applyMatrix = false;
    paperScope.project.addLayer(toolLayer);
}

/**
 * @class
 * @memberof OSDPaperjsAnnotation
 */
class RulerOverlay extends ViewerOverlayBase {
    static get label() { return 'Measurements'; }
    static get faIconClass() { return 'fa-ruler'; }

    /**
     * @param {OpenSeadragon.Viewer} viewer
     * @param {Object} [opts]
     * @param {boolean} [opts.registerWithConfig=true]
     * @param {boolean} [opts.showButton=true]
     * @param {boolean} [opts.headless=false]
     * @param {Object} [opts.host]
     * @param {() => void} [opts.host.openPanel]
     * @param {(state: string) => void} [opts.host.onRulerStateChange]
     * @param {() => void} [opts.host.onRulerCountChange]
     */
    constructor(viewer, opts = {}) {
        super(viewer, opts);
        this._headless = !!opts.headless;
        this._host = opts.host || null;

        this.overlay = new PaperOverlay(viewer, { overlayType: 'image' });
        this.overlay.setPointerEventsEnabled(false);
        ensureNamedToolLayer(this.overlay.paperScope);
        this.overlay.autoRescaleItems(true);

        this.tool = new RulerOverlayTool(this.overlay.paperScope, this);
        this.dummyTool = new this.overlay.paperScope.Tool();
        this.dummyTool.activate();

        this._mouseNavEnabledAtActivation = true;
        this._state = 'inactive';
        this._destroyed = false;
        /** @type {'mm'|'um'} Display unit when mpp is available */
        this._displayUnit = 'mm';
        /** @type {number} Max decimal places for ruler labels */
        this._decimals = 2;
        this.dialog = null;
        this.button = null;

        this._onEscKey = (ev) => this._handleEscape(ev);
        this._onReposition = () => this._positionDialog();

        if (!this._headless) {
            this.button = this.overlay.addViewerButton({
                faIconClass: 'fa-ruler',
                tooltip: 'Measurements',
                onClick: () => {
                    this._active ? this.deactivate() : this.activate();
                },
            });
            this.button.element.querySelector('svg.icon')?.style.setProperty('width', '1em');
            this._makeDialog();
        }

        this._unregisterContextMenu = getOverlayPointerRouter(viewer).register(
            this.overlay,
            'contextmenu',
            (ev) => this._offerContextMenu(ev),
        );

        this._onWorldItemCount = () => {
            const tl = this.overlay.paperScope.project.layers.toolLayer;
            if (tl) tl.bringToFront();
            this._syncScaleFromMpp();
            this._notifyCountChange();
        };
        this.viewer.world?.addHandler?.('add-item', this._onWorldItemCount);
        this.viewer.world?.addHandler?.('remove-item', this._onWorldItemCount);

        if (!this._headless) {
            document.addEventListener('keydown', this._onEscKey);
            window.addEventListener('resize', this._onReposition);
            this.viewer.addHandler?.('resize', this._onReposition);
            this.viewer.addHandler?.('animation', this._onReposition);
            this.viewer.addHandler?.('animation-finish', this._onReposition);
        }

        this.viewer.addOnceHandler('destroy', () => {
            this.destroy();
        });

        this._autoRegister();
    }

    activate() {
        const reactivate = this.overlay.setOSDMouseNavEnabled(false);
        this._mouseNavEnabledAtActivation = this._mouseNavEnabledAtActivation || reactivate;
        this.overlay.setPointerEventsEnabled(true);
        this.overlay.bringToFront();
        this._setActive(true);
        this.tool.activate();
        this.tool.setMode('idle');
        this._syncScaleFromMpp();
        this._setState('config');
    }

    deactivate() {
        if (this._state === 'measuring') {
            this.finishMeasuring();
        }
        dismissOverlayContextMenu();
        this._setActive(false);
        this._setState('inactive');
        this.tool.setMode('idle');
        this.tool.deactivate(true);
        this.dummyTool.activate();
        this.overlay.setOSDMouseNavEnabled(this._mouseNavEnabledAtActivation);
        this._mouseNavEnabledAtActivation = false;
        this.overlay.setPointerEventsEnabled(false);
        this.overlay.sendToBack();
    }

    getDropTargetLayer() {
        const world = this.viewer?.world;
        const count = world?.getItemCount?.() ?? 0;
        if (count !== 1) return null;
        const ti = world.getItemAt(0);
        return this.overlay.getPaperLayer(ti) ?? null;
    }

    clearAllViewerRulers() {
        const layer = this.getDropTargetLayer();
        if (!layer?.children) return;
        const toRemove = [];
        for (let i = 0; i < layer.children.length; i++) {
            const c = layer.children[i];
            if (c.name === 'viewerRuler' || c.data?.kind === VIEWER_RULER_KIND) {
                toRemove.push(c);
            }
        }
        for (const item of toRemove) item.remove();
        this._notifyCountChange();
    }

    countViewerRulers() {
        const layer = this.getDropTargetLayer();
        if (!layer?.children) return 0;
        let n = 0;
        for (let i = 0; i < layer.children.length; i++) {
            const c = layer.children[i];
            if (c.name === 'viewerRuler' || c.data?.kind === VIEWER_RULER_KIND) n++;
        }
        return n;
    }

    /** @returns {'inactive'|'config'|'measuring'} */
    getState() {
        return this._state;
    }

    isMeasuring() {
        return this._state === 'measuring';
    }

    startNew() {
        if (!this._active) this.activate();
        this._syncScaleFromMpp();
        this.tool.setMode('creating');
        this._setState('measuring');
    }

    finishMeasuring() {
        this.tool.finishMeasuring();
        this._setState(this._active ? 'config' : 'inactive');
        this._notifyCountChange();
    }

    /**
     * @param {paper.Item} measurement
     */
    beginModify(measurement) {
        if (!measurement) return;
        if (!this._active) this.activate();
        this.tool.activate();
        this.tool.setMode('modifying', measurement);
        this._setState('measuring');
    }

    notifyMeasurementCommitted() {
        this._setState('measuring');
        this._notifyCountChange();
    }

    /**
     * Shared display unit with scalebar (mm | um). No-op for px fallback when mpp missing.
     * @param {'mm'|'um'|string} unit
     */
    setDisplayUnit(unit) {
        this._displayUnit = unit === 'um' ? 'um' : 'mm';
        this._syncScaleFromMpp();
        this.refreshAllLabels();
    }

    getDisplayUnit() {
        return this._displayUnit;
    }

    /**
     * Max decimal places for ruler distance labels (scalebar unaffected).
     * @param {number} decimals
     */
    setDecimals(decimals) {
        const n = Number(decimals);
        this._decimals = Number.isFinite(n) ? Math.min(6, Math.max(0, Math.trunc(n))) : 2;
        this._syncScaleFromMpp();
        this.refreshAllLabels();
    }

    getDecimals() {
        return this._decimals;
    }

    refreshAllLabels() {
        const layer = this.getDropTargetLayer();
        if (!layer?.children) return;
        const scale = this.tool.getScale();
        for (let i = 0; i < layer.children.length; i++) {
            const root = layer.children[i];
            if (root.name !== 'viewerRuler' && root.data?.kind !== VIEWER_RULER_KIND) continue;
            const segmentGroup = root.children?.[0];
            if (segmentGroup) refreshSegmentLabel(segmentGroup, scale);
        }
        this.overlay.paperScope.view?.update?.();
    }

    _syncScaleFromMpp() {
        const mpp = mppFromActiveViewerImage(this.viewer);
        const decimals = this._decimals;
        if (mpp && Number.isFinite(mpp.x) && mpp.x > 0) {
            const um = this._displayUnit === 'um';
            this.tool.setScale({
                unitsPerPixel: um ? mpp.x : mpp.x / 1000,
                labelUnit: um ? 'um' : 'mm',
                decimals,
            });
        } else {
            this.tool.setScale({ unitsPerPixel: 1, labelUnit: 'px', decimals });
        }
    }

    _notifyCountChange() {
        this._updateClearEnabled();
        this._host?.onRulerCountChange?.();
    }

    _handleEscape(ev) {
        if (this._headless) return;
        if (ev.key !== 'Escape' || this._destroyed || !this._active) return;
        if (this._state === 'measuring') {
            ev.preventDefault();
            ev.stopPropagation();
            this.finishMeasuring();
            return;
        }
        if (this._state === 'config') {
            ev.preventDefault();
            ev.stopPropagation();
            this.deactivate();
        }
    }

    /**
     * @param {'inactive'|'config'|'measuring'} next
     */
    _setState(next) {
        this._state = next;
        this._host?.onRulerStateChange?.(next);

        if (!this.dialog) return;

        if (next === 'inactive') {
            this.dialog.classList.add('hidden');
            return;
        }

        this.dialog.classList.remove('hidden');
        const newBtn = this.dialog.querySelector('.ro-new');
        const doneBtn = this.dialog.querySelector('.ro-done');
        if (next === 'measuring') {
            newBtn?.classList.add('hidden');
            doneBtn?.classList.remove('hidden');
        } else {
            newBtn?.classList.remove('hidden');
            doneBtn?.classList.add('hidden');
        }
        this._updateClearEnabled();
        this._positionDialog();
    }

    _updateClearEnabled() {
        const clearBtn = this.dialog?.querySelector('.ro-clear');
        if (!clearBtn) return;
        clearBtn.disabled = this.countViewerRulers() === 0;
    }

    _positionDialog() {
        if (!this.dialog || this.dialog.classList.contains('hidden')) return;
        const btnEl = this.button?.element;
        if (!btnEl) return;
        const rect = btnEl.getBoundingClientRect();
        const gap = 6;
        this.dialog.style.left = `${Math.max(8, rect.left)}px`;
        this.dialog.style.top = `${rect.bottom + gap}px`;

        const dr = this.dialog.getBoundingClientRect();
        let left = dr.left;
        if (left + dr.width > window.innerWidth - 8) {
            left = window.innerWidth - dr.width - 8;
        }
        if (left < 8) left = 8;
        this.dialog.style.left = `${left}px`;
    }

    _makeDialog() {
        ensureRulerOverlayDialogStyles();
        const el = createRulerOverlayDialogElement();
        document.body.appendChild(el);
        this.dialog = el;

        el.querySelector('.ro-new')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.startNew();
        });
        el.querySelector('.ro-done')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.finishMeasuring();
        });
        el.querySelector('.ro-clear')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this._state === 'measuring') this.finishMeasuring();
            this.clearAllViewerRulers();
            this._setState('config');
        });
        el.querySelector('.ro-close')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.deactivate();
        });

        el.addEventListener('mousemove', (ev) => ev.stopPropagation());
        el.classList.add('hidden');
    }

    _offerContextMenu(ev) {
        if (this._destroyed) return OVERLAY_POINTER_MISS;

        const view = this.overlay.paperScope.view;
        const viewEl = view.element;
        const br = viewEl.getBoundingClientRect();
        const pt = view.viewToProject(new paper.Point(ev.clientX - br.left, ev.clientY - br.top));
        const measurement = this.tool.hitTestMeasurementAtProjectPoint(pt)
            || this._hitTestMeasurementOnLayer(pt);
        if (!measurement) return OVERLAY_POINTER_MISS;

        openOverlayContextMenu({
            clientX: ev.clientX,
            clientY: ev.clientY,
            viewer: this.viewer,
            items: [
                {
                    label: 'Modify',
                    onClick: () => {
                        if (this._headless) {
                            this._host?.openPanel?.();
                            this.beginModify(measurement);
                            return;
                        }
                        if (!this._active) this.activate();
                        this.beginModify(measurement);
                    },
                },
                {
                    label: 'Delete',
                    onClick: () => {
                        if (this.tool.getCurrentMeasurement() === measurement) {
                            this.tool.finishMeasuring();
                            this._setState(this._active ? 'config' : 'inactive');
                        }
                        measurement.remove();
                        this._notifyCountChange();
                    },
                },
            ],
        });
        return OVERLAY_POINTER_CLAIM;
    }

    _hitTestMeasurementOnLayer(projectPoint) {
        const layer = this.getDropTargetLayer();
        if (!layer || !projectPoint) return null;
        const hit = layer.hitTest(projectPoint, {
            fill: true,
            stroke: true,
            segments: true,
            tolerance: 8,
            match: (hr) => Boolean(findViewerRulerRoot(hr.item)),
        });
        return hit ? findViewerRulerRoot(hit.item) : null;
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;

        if (!this._headless) {
            document.removeEventListener('keydown', this._onEscKey);
            window.removeEventListener('resize', this._onReposition);
            this.viewer.removeHandler?.('resize', this._onReposition);
            this.viewer.removeHandler?.('animation', this._onReposition);
            this.viewer.removeHandler?.('animation-finish', this._onReposition);
        }
        this.viewer.world?.removeHandler?.('add-item', this._onWorldItemCount);
        this.viewer.world?.removeHandler?.('remove-item', this._onWorldItemCount);

        this._unregisterContextMenu?.();
        this._unregisterContextMenu = null;
        dismissOverlayContextMenu();

        this.dialog?.remove();
        this.dialog = null;

        try {
            this.tool?.deactivate?.(true);
        } catch { /* ignore */ }
        try {
            this.overlay?.destroy?.();
        } catch { /* ignore */ }

        super.destroy();
    }
}

export { RulerOverlay };
