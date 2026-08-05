/**
 * Field of view overlay: physical diameter (mpp-backed) with preview on toolLayer
 * and committed circles on the active TiledImage Paper layer (image-registered).
 */

import { PaperOverlay } from '../../paper-overlay.mjs';
import { paper } from '../../paperjs.mjs';
import { domObjectFromHTML } from '../../utils/domObjectFromHTML.mjs';
import { syncNumericInputStep } from '../../utils/numericInputStep.mjs';
import { loadFieldOfViewSettings, normalizeFieldOfViewSettings, saveFieldOfViewSettings } from './fieldofview-settings.mjs';
import {
    areaMm2FromDiameterPhysical,
    diameterPhysicalFromAreaMm2,
    diameterPhysicalToBasePixels,
    mppFromTiledImage,
} from './fieldofview-geometry.mjs';
import { FieldOfViewTool } from './fieldofview-tool.mjs';
import { ViewerOverlayBase } from '../base.mjs';
import {
    ensureOverlayDialogStyles,
    OVERLAY_DIALOG_CARD_CLASS,
    OVERLAY_DIALOG_CLASS,
} from '../../utils/overlayDialog.mjs';
import { dismissOverlayContextMenu, openOverlayContextMenu } from '../../utils/overlayContextMenu.mjs';
import {
    getOverlayPointerRouter,
    OVERLAY_POINTER_CLAIM,
    OVERLAY_POINTER_MISS,
} from '../overlay-pointer-router.mjs';

/**
 * @param {paper.PaperScope} paperScope
 */
function ensureNamedToolLayer(paperScope) {
    if (paperScope.project.layers.toolLayer) {
        return;
    }
    const toolLayer = new paperScope.Layer();
    toolLayer.isGeoJSONFeatureCollection = false;
    toolLayer.name = 'toolLayer';
    toolLayer.applyMatrix = false;
    paperScope.project.addLayer(toolLayer);
}

class FieldOfViewOverlay extends ViewerOverlayBase {
    static get label() { return 'Field of view'; }
    static get faIconClass() { return 'fa-microscope'; }

    /**
     * @param {OpenSeadragon.Viewer} viewer
     * @param {Object} [opts]
     * @param {boolean} [opts.registerWithConfig=true] Set false to suppress auto-registration with ConfigurationWidget
     */
    constructor(viewer, opts = {}) {
        super(viewer, opts);
        this.overlay = new PaperOverlay(viewer, { overlayType: 'image' });
        this.overlay.setPointerEventsEnabled(false);
        ensureNamedToolLayer(this.overlay.paperScope);

        // Same wiring as AnnotationToolkit: zoom-driven rescale for items with a `rescale` map.
        this.overlay.autoRescaleItems(true);

        this.tool = new FieldOfViewTool(this.overlay.paperScope, this);
        this.dummyTool = new this.overlay.paperScope.Tool();
        this.dummyTool.activate();

        this._mouseNavEnabledAtActivation = true;
        this._state = 'inactive';
        this._saveSettingsTimeout = null;

        this.settings = loadFieldOfViewSettings();

        this._onWorldItemCount = () => {
            const n = this.viewer.world?.getItemCount?.() ?? 0;
            if (this._active && n !== 1) {
                this.deactivate();
            }
            // New tile layers are registered after our toolLayer; keep preview/tool chrome on top.
            const tl = this.overlay.paperScope.project.layers.toolLayer;
            if (tl) {
                tl.bringToFront();
            }
        };
        this.viewer.world.addHandler('add-item', this._onWorldItemCount);
        this.viewer.world.addHandler('remove-item', this._onWorldItemCount);

        this.button = this.overlay.addViewerButton({
            faIconClass: 'fa-microscope',
            tooltip: 'Field of view',
            onClick: () => {
                this._active ? this.deactivate() : this.activate();
            },
        });
        this.button.element.querySelector('svg.icon')?.style.setProperty('width', '1em');

        this._makeDialog();

        this._unregisterContextMenu = getOverlayPointerRouter(viewer).register(
            this.overlay,
            'contextmenu',
            (ev) => this._offerFovContextMenu(ev),
        );
        this.viewer.addOnceHandler('destroy', () => {
            this._unregisterContextMenu?.();
            this._unregisterContextMenu = null;
            dismissOverlayContextMenu();
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
        this._setState('config');
    }

    deactivate() {
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

    /**
     * @returns {OpenSeadragon.TiledImage}
     */
    _resolveActiveTiledImageOrThrow() {
        const world = this.viewer?.world;
        const count = world?.getItemCount ? world.getItemCount() : 0;
        if (count === 0) {
            throw new Error('Field of view overlay: no active image found (viewer.world has 0 items).');
        }
        if (count > 1) {
            throw new Error('Field of view overlay: multiple images are active; this overlay supports exactly one active image.');
        }
        return world.getItemAt(0);
    }

    /**
     * Paper layer for this overlay’s scope on the active tile (image-local coordinates).
     * @returns {paper.Layer | null}
     */
    getDropTargetLayer() {
        try {
            const ti = this._resolveActiveTiledImageOrThrow();
            return this.overlay.getPaperLayer(ti) ?? null;
        } catch {
            return null;
        }
    }

    /**
     * Remove all committed field-of-view rings from the active tile Paper layer.
     */
    clearAllDroppedFieldOfViews() {
        const layer = this.getDropTargetLayer();
        if (!layer || !layer.children) return;
        const toRemove = [];
        for (let i = 0; i < layer.children.length; i++) {
            const c = layer.children[i];
            if (c.name === 'fovDroppedRing' || c.data?.kind === 'fieldOfView') {
                toRemove.push(c);
            }
        }
        for (const item of toRemove) {
            item.remove();
        }
        this._syncDialogFromSettings();
    }

    /**
     * @returns {number}
     */
    countDroppedFovRings() {
        const layer = this.getDropTargetLayer();
        if (!layer?.children) return 0;
        let n = 0;
        for (let i = 0; i < layer.children.length; i++) {
            const c = layer.children[i];
            if (c.name === 'fovDroppedRing' || c.data?.kind === 'fieldOfView') n++;
        }
        return n;
    }

    /**
     * @param {paper.Point | null} projectPoint
     * @returns {paper.Item | null}
     */
    hitTestFovRingAtProjectPoint(projectPoint) {
        const layer = this.getDropTargetLayer();
        if (!layer || !projectPoint) return null;
        const view = this.overlay.paperScope.view;
        const tolerance = this._fovHitTolerance(view, layer);
        const hit = layer.hitTest(projectPoint, {
            fill: true,
            stroke: true,
            segments: true,
            tolerance,
            match: (hr) => Boolean(this._findFovDroppedRingGroup(hr.item)),
        });
        return hit ? this._findFovDroppedRingGroup(hit.item) : null;
    }

    /**
     * @param {paper.Item | null} item
     * @returns {paper.Item | null} Root group for a dropped FOV ring, if any.
     */
    _findFovDroppedRingGroup(item) {
        let cur = item;
        while (cur) {
            if (cur.name === 'fovDroppedRing' || cur.data?.kind === 'fieldOfView') {
                return cur;
            }
            cur = cur.parent;
        }
        return null;
    }

    /**
     * Same tolerance convention as {@link ToolBase#getTolerance} (screen px → project units).
     * @param {paper.View} view
     * @param {paper.Layer} layer
     */
    _fovHitTolerance(view, layer) {
        const scale = layer.scaling?.x || 1;
        return 5 / scale / view.getZoom();
    }

    /**
     * @param {number} clientX
     * @param {number} clientY
     * @param {paper.Item} ringGroup
     */
    _openFovContextMenu(clientX, clientY, ringGroup) {
        const fmt = (n, digits = 6) => {
            const x = Number(n);
            if (!Number.isFinite(x)) return '';
            const s = x.toFixed(digits);
            return s.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
        };

        const dPx = Number(ringGroup?.data?.diameterPx);
        const dPhys = Number(ringGroup?.data?.diameterPhysical);
        const unit = ringGroup?.data?.unit === 'um' ? 'um' : 'mm';

        const lines = [];
        if (Number.isFinite(dPhys) && dPhys > 0) {
            lines.push(`Diameter: ${fmt(dPhys, unit === 'mm' ? 4 : 2)} ${unit}${Number.isFinite(dPx) && dPx > 0 ? ` (${fmt(dPx, 2)} px)` : ''}`);
            const aMm2 = areaMm2FromDiameterPhysical(dPhys, unit);
            if (aMm2 != null) {
                lines.push(`Area: ${fmt(aMm2, 8)} mm²`);
            }
        } else if (Number.isFinite(dPx) && dPx > 0) {
            lines.push(`Diameter: ${fmt(dPx, 2)} px`);
        }

        openOverlayContextMenu({
            clientX,
            clientY,
            viewer: this.viewer,
            header: lines.length ? lines.join('\n') : null,
            items: [
                {
                    label: 'Delete this field of view',
                    onClick: () => {
                        ringGroup.remove();
                        this.notifyFovRingGeometryChanged();
                    },
                },
                {
                    label: 'Delete all',
                    onClick: () => {
                        this.clearAllDroppedFieldOfViews();
                    },
                },
            ],
        });
    }

    /**
     * @param {MouseEvent} ev
     */
    _offerFovContextMenu(ev) {
        dismissOverlayContextMenu();

        const view = this.overlay.paperScope.view;
        const viewEl = view.element;
        const br = viewEl.getBoundingClientRect();
        const ox = ev.clientX - br.left;
        const oy = ev.clientY - br.top;
        const pt = view.viewToProject(new paper.Point(ox, oy));
        const ring = this.hitTestFovRingAtProjectPoint(pt);
        if (!ring) return OVERLAY_POINTER_MISS;

        this._openFovContextMenu(ev.clientX, ev.clientY, ring);
        return OVERLAY_POINTER_CLAIM;
    }

    /**
     * @param {OpenSeadragon.Point} centerImg
     * @param {number} diameterPx
     */
    buildDropItemData(centerImg, diameterPx) {
        const mpp = this._getMppOrNull();
        const base = {
            kind: 'fieldOfView',
            schemaVersion: 1,
            centerImage: { x: centerImg.x, y: centerImg.y },
            diameterPx,
        };
        if (!mpp) {
            return base;
        }
        return {
            ...base,
            unit: this.settings.unit,
            diameterPhysical: Number(this.settings.diameter),
            mpp: { x: mpp.x, y: mpp.y },
        };
    }

    _scheduleSaveSettings() {
        this._saveSettingsTimeout && clearTimeout(this._saveSettingsTimeout);
        this._saveSettingsTimeout = setTimeout(() => {
            this._saveSettingsTimeout = null;
            saveFieldOfViewSettings(this.settings);
        }, 200);
    }

    _getMppOrNull() {
        try {
            return mppFromTiledImage(this._resolveActiveTiledImageOrThrow());
        } catch {
            return null;
        }
    }

    /**
     * Same draft parsing pattern as screenshot overlay: trim, require finite number > 0.
     * @param {string} text
     * @returns {{ ok: true, value: number } | { ok: false }}
     */
    _parsePositiveFloatDraft(text) {
        const s = String(text ?? '').trim();
        if (s === '') return { ok: false };
        const n = Number(s);
        if (!Number.isFinite(n) || n <= 0) return { ok: false };
        return { ok: true, value: n };
    }

    /** @param {Element | null} el */
    _isFocused(el) {
        return Boolean(el && typeof document !== 'undefined' && document.activeElement === el);
    }

    /**
     * Avoid clobbering in-progress typing when mirroring the paired numeric field (screenshot overlay pattern).
     * @param {HTMLInputElement | null} input
     * @param {string} valueString
     */
    _setIfNotFocused(input, valueString) {
        if (!input) return;
        if (this._isFocused(input)) return;
        const s = String(valueString ?? '');
        input.value = s;
        syncNumericInputStep(input, s);
    }

    /** @param {number} d @param {'mm'|'um'} unit */
    _formatDiameterForInput(d, unit) {
        if (!Number.isFinite(d) || d <= 0) return '';
        const digits = unit === 'um' ? 2 : 4;
        const s = d.toFixed(digits);
        return s.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
    }

    /** @param {number} a */
    _formatAreaMm2ForInput(a) {
        if (!Number.isFinite(a) || a <= 0) return '';
        const s = a.toFixed(8);
        return s.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
    }

    /**
     * Read diameter / area inputs and commit into `this.settings` (used before Place if user did not blur).
     */
    _commitFovDialogInputsFromDom() {
        if (!this.dialog) return;
        const dIn = this.dialog.querySelector('.fov-diameter');
        const aIn = this.dialog.querySelector('.fov-area-mm2');
        const active = typeof document !== 'undefined' ? document.activeElement : null;
        if (active === aIn && aIn) {
            const pa = this._parsePositiveFloatDraft(aIn.value);
            if (pa.ok) {
                const dPhys = diameterPhysicalFromAreaMm2(pa.value, this.settings.unit);
                if (dPhys != null) {
                    this.settings.diameter = dPhys;
                }
            }
        } else if (dIn) {
            const pd = this._parsePositiveFloatDraft(dIn.value);
            if (pd.ok) {
                this.settings.diameter = pd.value;
            }
        }
        this.settings = normalizeFieldOfViewSettings(this.settings);
        this._scheduleSaveSettings();
    }

    _setState(next) {
        this._state = next;
        if (!this.dialog) return;
        const el = this.dialog;
        const label = el.querySelector('.fov-compact-label');
        if (next === 'inactive') {
            el.classList.add('hidden');
            el.classList.remove('fov-dialog--compact');
            return;
        }
        el.classList.remove('hidden');
        if (next === 'placing' || next === 'editing') {
            el.classList.add('fov-dialog--compact');
            if (label) {
                label.textContent = next === 'placing' ? 'Placing…' : 'Editing…';
            }
            return;
        }
        el.classList.remove('fov-dialog--compact');
        if (next === 'config') {
            this._syncDialogFromSettings();
        }
    }

    _syncDialogFromSettings() {
        if (!this.dialog) return;
        this.settings = normalizeFieldOfViewSettings(this.settings);
        const el = this.dialog;

        const diameterInput = el.querySelector('.fov-diameter');
        const areaInput = el.querySelector('.fov-area-mm2');
        const unitSel = el.querySelector('.fov-unit');
        this._setIfNotFocused(diameterInput, this._formatDiameterForInput(this.settings.diameter, this.settings.unit));
        const aMm2 = areaMm2FromDiameterPhysical(this.settings.diameter, this.settings.unit);
        if (aMm2 != null) {
            this._setIfNotFocused(areaInput, this._formatAreaMm2ForInput(aMm2));
        } else if (areaInput && !this._isFocused(areaInput)) {
            areaInput.value = '';
            syncNumericInputStep(areaInput, '');
        }
        if (unitSel) unitSel.value = this.settings.unit;

        const mpp = this._getMppOrNull();
        const warn = el.querySelector('.fov-mpp-warning');
        const placeBtn = el.querySelector('.fov-place');
        const clearBtn = el.querySelector('.fov-clear-all');
        const adjustBtn = el.querySelector('.fov-adjust-circles');
        const multi = (this.viewer.world?.getItemCount?.() ?? 0) > 1;
        const none = (this.viewer.world?.getItemCount?.() ?? 0) === 0;
        const ringCount = this.countDroppedFovRings();
        const canPlace = !none && !multi && Boolean(mpp);

        if (none || multi) {
            if (warn) {
                warn.textContent = none
                    ? 'No image in the viewer.'
                    : 'Multiple images are open; field of view supports exactly one image.';
                warn.classList.remove('hidden');
            }
            if (placeBtn) placeBtn.disabled = true;
            if (clearBtn) clearBtn.disabled = true;
            if (adjustBtn) adjustBtn.disabled = true;
        } else if (!mpp) {
            if (warn) {
                warn.textContent = 'Requires mpp metadata (µm/px) to convert physical size to pixels.';
                warn.classList.remove('hidden');
            }
            if (placeBtn) placeBtn.disabled = true;
            if (clearBtn) clearBtn.disabled = false;
            if (adjustBtn) adjustBtn.disabled = true;
        } else {
            if (warn) {
                warn.textContent = '';
                warn.classList.add('hidden');
            }
            if (placeBtn) placeBtn.disabled = false;
            if (clearBtn) clearBtn.disabled = false;
            if (adjustBtn) adjustBtn.disabled = !canPlace || ringCount === 0;
        }
    }

    _diameterPixelsFromSettings() {
        const mpp = this._getMppOrNull();
        if (!mpp) return null;
        return diameterPhysicalToBasePixels(mpp, this.settings?.diameter, this.settings.unit);
    }

    /** Keeps full-dialog action buttons in sync after a ring is dropped without leaving compact mode. */
    notifyFovRingGeometryChanged() {
        this._syncDialogFromSettings();
    }

    _makeDialog() {
        const html = `<div class="fov-dialog ${OVERLAY_DIALOG_CLASS} ${OVERLAY_DIALOG_CARD_CLASS} hidden">
            <div class="fov-dialog-full">
                <div class="fov-header osd-overlay-dialog-header">
                    <div class="fov-title osd-overlay-dialog-title">Field of view</div>
                    <button class="close fov-close osd-overlay-dialog-close" type="button" aria-label="Close">×</button>
                </div>
                <div class="fov-body">
                    <div class="fov-row">
                        <span class="fov-muted">Diameter</span>
                        <input class="fov-diameter" type="number" inputmode="decimal" />
                        <select class="fov-unit">
                            <option value="mm">mm</option>
                            <option value="um">µm</option>
                        </select>
                    </div>
                    <div class="fov-row">
                        <span class="fov-muted">Area</span>
                        <input class="fov-area-mm2" type="number" inputmode="decimal" />
                        <span class="fov-muted">mm²</span>
                    </div>
                    <div class="fov-row fov-mpp-warning fov-muted hidden"></div>
                    <div class="fov-actions">
                        <button class="fov-clear-all" type="button">Clear all</button>
                        <button class="fov-adjust-circles" type="button">Adjust circles</button>
                        <button class="fov-place fov-primary" type="button">Place field of view</button>
                    </div>
                    <div class="fov-hint fov-muted">Esc closes. Place: preview then click to drop. Adjust: drag rings; right-click for menu.</div>
                </div>
            </div>
            <div class="fov-compact-bar" aria-label="Field of view mode">
                <span class="fov-compact-label"></span>
                <span class="fov-compact-spacer"></span>
                <button class="fov-compact-plus" type="button" title="Return to full settings">+</button>
                <button class="fov-compact-exit" type="button">Exit</button>
            </div>
        </div>`;

        const css = `<style data-type="fieldofview-overlay">
            .fov-dialog{
                width: min(360px, calc(100% - 24px));
            }
            .hidden{ display:none !important; }
            .fov-dialog.fov-dialog--compact{
                position: fixed;
                top: 12px;
                left: 50%;
                transform: translateX(-50%);
                width: auto;
                min-width: 260px;
                max-width: min(480px, calc(100% - 24px));
                max-height: none;
                overflow: visible;
            }
            .fov-dialog.fov-dialog--compact .fov-dialog-full{ display: none !important; }
            .fov-dialog:not(.fov-dialog--compact) .fov-compact-bar{ display: none !important; }
            .fov-compact-bar{
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 12px;
                flex-wrap: wrap;
            }
            .fov-compact-label{
                font-weight: 600;
                white-space: nowrap;
            }
            .fov-compact-spacer{ flex: 1 1 auto; min-width: 8px; }
            .fov-body{ padding: 10px 12px; }
            .fov-row{
                display:flex;
                gap: 8px;
                align-items:center;
                flex-wrap: wrap;
                margin: 2px 0;
            }
            .fov-muted{ color: rgba(0,0,0,0.60); }
            .fov-actions{ margin-top: 10px; display:flex; justify-content:flex-end; align-items:center; gap: 8px; flex-wrap: wrap; }
            .fov-hint{ margin-top: 8px; }
            button{
                font: inherit;
                padding: 5px 10px;
                border: 1px solid rgba(0,0,0,0.18);
                background: #fff;
                border-radius: 8px;
                cursor: pointer;
            }
            button:hover{ border-color: rgba(0,0,0,0.30); }
            button.fov-primary{
                background: #111;
                color: #fff;
                border-color: #111;
            }
            button.fov-primary:hover{ background:#000; border-color:#000; }
            input[type=number]{
                width: 7.5em;
                padding: 4px 6px;
                border: 1px solid rgba(0,0,0,0.18);
                border-radius: 8px;
                font: inherit;
            }
            select{
                padding: 4px 6px;
                border: 1px solid rgba(0,0,0,0.18);
                border-radius: 8px;
                font: inherit;
                background: #fff;
            }
        </style>`;

        ensureOverlayDialogStyles();
        if (!document.querySelector('style[data-type="fieldofview-overlay"]')) {
            document.querySelector('head')?.appendChild(domObjectFromHTML(css));
        }

        const el = domObjectFromHTML(html);
        this.viewer.container.appendChild(el);
        el.addEventListener('mousemove', (ev) => ev.stopPropagation());
        el.querySelectorAll('.close').forEach((e) => e.addEventListener('click', () => this.deactivate()));

        const diameterInput = el.querySelector('.fov-diameter');
        const areaInput = el.querySelector('.fov-area-mm2');

        diameterInput?.addEventListener('blur', () => {
            const parsed = this._parsePositiveFloatDraft(diameterInput.value);
            if (parsed.ok) {
                this.settings.diameter = parsed.value;
                this.settings = normalizeFieldOfViewSettings(this.settings);
                this._scheduleSaveSettings();
            }
            this._syncDialogFromSettings();
            this.tool.setDiameterPixels(this._diameterPixelsFromSettings());
        });
        diameterInput?.addEventListener('input', () => {
            syncNumericInputStep(diameterInput);
            const parsed = this._parsePositiveFloatDraft(diameterInput.value);
            if (parsed.ok) {
                const aMm2 = areaMm2FromDiameterPhysical(parsed.value, this.settings.unit);
                if (aMm2 != null) {
                    this._setIfNotFocused(areaInput, this._formatAreaMm2ForInput(aMm2));
                }
                const mpp = this._getMppOrNull();
                if (mpp) {
                    const px = diameterPhysicalToBasePixels(mpp, parsed.value, this.settings.unit);
                    this.tool.setDiameterPixels(px);
                }
            }
        });

        areaInput?.addEventListener('blur', () => {
            const parsed = this._parsePositiveFloatDraft(areaInput.value);
            if (parsed.ok) {
                const dPhys = diameterPhysicalFromAreaMm2(parsed.value, this.settings.unit);
                if (dPhys != null) {
                    this.settings.diameter = dPhys;
                    this.settings = normalizeFieldOfViewSettings(this.settings);
                    this._scheduleSaveSettings();
                }
            }
            this._syncDialogFromSettings();
            this.tool.setDiameterPixels(this._diameterPixelsFromSettings());
        });
        areaInput?.addEventListener('input', () => {
            syncNumericInputStep(areaInput);
            const parsed = this._parsePositiveFloatDraft(areaInput.value);
            if (parsed.ok) {
                const dPhys = diameterPhysicalFromAreaMm2(parsed.value, this.settings.unit);
                if (dPhys != null) {
                    this._setIfNotFocused(diameterInput, this._formatDiameterForInput(dPhys, this.settings.unit));
                    const mpp = this._getMppOrNull();
                    if (mpp) {
                        const px = diameterPhysicalToBasePixels(mpp, dPhys, this.settings.unit);
                        this.tool.setDiameterPixels(px);
                    }
                }
            }
        });

        const unitSel = el.querySelector('.fov-unit');
        unitSel?.addEventListener('change', () => {
            this.settings.unit = unitSel.value === 'um' ? 'um' : 'mm';
            this.settings = normalizeFieldOfViewSettings(this.settings);
            this._scheduleSaveSettings();
            this._syncDialogFromSettings();
            this.tool.setDiameterPixels(this._diameterPixelsFromSettings());
        });

        const clearBtn = el.querySelector('.fov-clear-all');
        clearBtn?.addEventListener('click', () => {
            this.clearAllDroppedFieldOfViews();
        });

        const placeBtn = el.querySelector('.fov-place');
        placeBtn?.addEventListener('click', () => {
            this._commitFovDialogInputsFromDom();
            this._syncDialogFromSettings();
            const px = this._diameterPixelsFromSettings();
            if (!px) return;
            this.tool.setDiameterPixels(px);
            this.tool.setMode('placing');
            this._setState('placing');
        });

        const adjustBtn = el.querySelector('.fov-adjust-circles');
        adjustBtn?.addEventListener('click', () => {
            this._commitFovDialogInputsFromDom();
            this._syncDialogFromSettings();
            if (adjustBtn.disabled) return;
            const px = this._diameterPixelsFromSettings();
            if (!px) return;
            this.tool.setDiameterPixels(px);
            this.tool.setMode('editing');
            this._setState('editing');
        });

        el.querySelector('.fov-compact-plus')?.addEventListener('click', () => {
            this.tool.clearEditUiState();
            this.tool.setMode('idle');
            this._setState('config');
        });
        el.querySelector('.fov-compact-exit')?.addEventListener('click', () => {
            this.deactivate();
        });

        this.dialog = el;
        this._syncDialogFromSettings();
        this.tool.setDiameterPixels(this._diameterPixelsFromSettings());
    }
}

export { FieldOfViewOverlay };
