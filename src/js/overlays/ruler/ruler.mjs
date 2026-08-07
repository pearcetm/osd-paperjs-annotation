/**
 * Convenience ruler engine: create/modify two-point image measurements.
 * Soft panel open keeps OSD mouse nav on; create/modify takes interaction capture.
 *
 * Driven by MeasurementsOverlay — no toolbar button or dialog of its own.
 * States: inactive | config | measuring
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
     * @param {Object} [opts.host]
     * @param {() => void} [opts.host.openPanel]
     * @param {(state: string) => void} [opts.host.onRulerStateChange]
     * @param {() => void} [opts.host.onRulerCountChange]
     */
    constructor(viewer, opts = {}) {
        super(viewer, { ...opts, registerWithConfig: false, showButton: false });
        this._host = opts.host || null;

        this.overlay = new PaperOverlay(viewer, { overlayType: 'image' });
        this.overlay.setPointerEventsEnabled(false);
        ensureNamedToolLayer(this.overlay.paperScope);
        this.overlay.autoRescaleItems(true);

        this.tool = new RulerOverlayTool(this.overlay.paperScope, this);
        this.dummyTool = new this.overlay.paperScope.Tool();
        this.dummyTool.activate();

        this._mouseNavEnabledAtActivation = true;
        /** True while create/modify owns pointer + OSD mouse nav. */
        this._interactionCapture = false;
        this._state = 'inactive';
        this._destroyed = false;
        /** @type {'mm'|'um'} Display unit when mpp is available */
        this._displayUnit = 'mm';
        /** @type {number} Max decimal places for ruler labels */
        this._decimals = 2;

        const pointerRouter = getOverlayPointerRouter(viewer);
        this._unregisterContextMenu = pointerRouter.register(
            this.overlay,
            'contextmenu',
            (ev) => this._offerContextMenu(ev),
        );
        // Idle + panel open: pointer-events are off so pan/zoom works; hit-to-edit via router.
        this._unregisterIdleSelect = pointerRouter.register(
            this.overlay,
            'mousedown',
            (ev) => this._offerIdleSelect(ev),
        );

        this._onWorldItemCount = () => {
            const tl = this.overlay.paperScope.project.layers.toolLayer;
            if (tl) tl.bringToFront();
            this._syncScaleFromMpp();
            this._notifyCountChange();
        };
        this.viewer.world?.addHandler?.('add-item', this._onWorldItemCount);
        this.viewer.world?.addHandler?.('remove-item', this._onWorldItemCount);

        this.viewer.addOnceHandler('destroy', () => {
            this.destroy();
        });
    }

    /**
     * Soft panel open: keep OSD mouse nav on. Capture starts on New / Modify.
     */
    activate() {
        this.overlay.bringToFront();
        this._setActive(true);
        this.tool.setMode('idle');
        this._syncScaleFromMpp();
        this._setState('config');
    }

    deactivate() {
        if (this._state === 'measuring') {
            this.finishMeasuring();
        }
        dismissOverlayContextMenu();
        this._endInteractionCapture();
        this._setActive(false);
        this._setState('inactive');
        this.tool.setMode('idle');
        this.overlay.sendToBack();
    }

    /** Disable mouse nav and take pointer events for create/modify. */
    _beginInteractionCapture() {
        if (this._interactionCapture) return;
        const wasEnabled = this.overlay.setOSDMouseNavEnabled(false);
        this._mouseNavEnabledAtActivation = wasEnabled;
        this.overlay.setPointerEventsEnabled(true);
        this.overlay.bringToFront();
        this.tool.activate();
        this._interactionCapture = true;
    }

    /** Restore mouse nav after create/modify; panel may stay open. */
    _endInteractionCapture() {
        if (!this._interactionCapture) {
            this.overlay.setPointerEventsEnabled(false);
            return;
        }
        this.tool.deactivate(true);
        this.dummyTool.activate();
        this.overlay.setOSDMouseNavEnabled(this._mouseNavEnabledAtActivation);
        this._mouseNavEnabledAtActivation = true;
        this.overlay.setPointerEventsEnabled(false);
        this._interactionCapture = false;
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

    /**
     * @returns {'idle'|'creating'|'modifying'}
     */
    getSessionKind() {
        const m = this.tool?.getMode?.() || 'idle';
        if (m === 'creating') return 'creating';
        if (m === 'modifying' || m === 'endpoint-drag' || m === 'line-drag') return 'modifying';
        return 'idle';
    }

    startNew() {
        if (!this._active) this.activate();
        if (this.tool.getMode() === 'modifying'
            || this.tool.getMode() === 'endpoint-drag'
            || this.tool.getMode() === 'line-drag') {
            this.tool.finishMeasuring();
        }
        this._syncScaleFromMpp();
        this._beginInteractionCapture();
        this.tool.setMode('creating');
        this._setState('measuring');
    }

    finishMeasuring() {
        this.tool.finishMeasuring();
        this._endInteractionCapture();
        this._setState(this._active ? 'config' : 'inactive');
        this._notifyCountChange();
    }

    /**
     * @param {paper.Item} measurement
     */
    beginModify(measurement) {
        if (!measurement) return;
        if (!this._active) this.activate();
        this._beginInteractionCapture();
        this.tool.setMode('modifying', measurement);
        this._setState('measuring');
    }

    /** After a successful draw: keep item, stay idle (not editing). */
    notifyMeasurementCommitted() {
        this._endInteractionCapture();
        this._setState(this._active ? 'config' : 'inactive');
        this._notifyCountChange();
    }

    /** Canvas click-elsewhere or equivalent: left edit, stay in panel idle. */
    notifyToolIdle() {
        this._endInteractionCapture();
        this._setState(this._active ? 'config' : 'inactive');
    }

    /** Entered modify via canvas hit (tool already set mode). */
    notifyEnteredModify() {
        this._beginInteractionCapture();
        this._setState('measuring');
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
        this._host?.onRulerCountChange?.();
    }

    /**
     * @param {'inactive'|'config'|'measuring'} next
     */
    _setState(next) {
        this._state = next;
        this._host?.onRulerStateChange?.(next);
    }

    _projectPointFromClientEvent(ev) {
        const view = this.overlay.paperScope.view;
        const viewEl = view.element;
        const br = viewEl.getBoundingClientRect();
        return view.viewToProject(new paper.Point(ev.clientX - br.left, ev.clientY - br.top));
    }

    /**
     * Panel open + idle: select a measurement without blocking pan (capture off).
     * @param {MouseEvent} ev
     */
    _offerIdleSelect(ev) {
        if (this._destroyed || !this._active || this._interactionCapture) {
            return OVERLAY_POINTER_MISS;
        }
        if (typeof ev.button === 'number' && ev.button !== 0) {
            return OVERLAY_POINTER_MISS;
        }

        const pt = this._projectPointFromClientEvent(ev);
        const measurement = this.tool.hitTestMeasurementAtProjectPoint(pt)
            || this._hitTestMeasurementOnLayer(pt);
        if (!measurement) return OVERLAY_POINTER_MISS;

        this.beginModify(measurement);
        return OVERLAY_POINTER_CLAIM;
    }

    _offerContextMenu(ev) {
        if (this._destroyed) return OVERLAY_POINTER_MISS;

        const pt = this._projectPointFromClientEvent(ev);
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
                        this._host?.openPanel?.();
                        this.beginModify(measurement);
                    },
                },
                {
                    label: 'Delete',
                    onClick: () => {
                        if (this.tool.getCurrentMeasurement() === measurement) {
                            this.finishMeasuring();
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

        this.viewer.world?.removeHandler?.('add-item', this._onWorldItemCount);
        this.viewer.world?.removeHandler?.('remove-item', this._onWorldItemCount);

        this._unregisterContextMenu?.();
        this._unregisterContextMenu = null;
        this._unregisterIdleSelect?.();
        this._unregisterIdleSelect = null;
        dismissOverlayContextMenu();
        this._endInteractionCapture();

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
