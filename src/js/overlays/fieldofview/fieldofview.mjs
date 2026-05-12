/**
 * Field of view overlay: physical diameter (mpp-backed) with preview on toolLayer
 * and committed circles on the active TiledImage Paper layer (image-registered).
 */

import { PaperOverlay } from '../../paper-overlay.mjs';
import { paper } from '../../paperjs.mjs';
import { domObjectFromHTML } from '../../utils/domObjectFromHTML.mjs';
import { loadFieldOfViewSettings, normalizeFieldOfViewSettings, saveFieldOfViewSettings } from './fieldofview-settings.mjs';
import {
    areaMm2FromDiameterPhysical,
    diameterPhysicalFromAreaMm2,
    diameterPhysicalToBasePixels,
    mppFromTiledImage,
} from './fieldofview-geometry.mjs';
import { FieldOfViewTool } from './fieldofview-tool.mjs';
import { ViewerOverlayBase } from '../base.mjs';

const FOV_DEBUG = true;
/** @param {...unknown} args */
function fovOverlayLog(...args) {
    if (FOV_DEBUG) console.log('[FOV overlay]', ...args);
}

/**
 * @param {paper.PaperScope} paperScope
 */
function ensureNamedToolLayer(paperScope) {
    if (paperScope.project.layers.toolLayer) {
        fovOverlayLog('ensureNamedToolLayer: toolLayer already present', {
            name: paperScope.project.layers.toolLayer.name,
        });
        return;
    }
    const toolLayer = new paperScope.Layer();
    toolLayer.isGeoJSONFeatureCollection = false;
    toolLayer.name = 'toolLayer';
    toolLayer.applyMatrix = false;
    paperScope.project.addLayer(toolLayer);
    fovOverlayLog('ensureNamedToolLayer: created toolLayer', { name: toolLayer.name });
}

class FieldOfViewOverlay extends ViewerOverlayBase {
    static get label() { return 'Field of view'; }
    static get faIconClass() { return 'fa-binoculars'; }

    /**
     * @param {import('../../osd-loader.mjs').OpenSeadragon.Viewer} viewer
     * @param {Object} [opts]
     * @param {boolean} [opts.registerWithConfig=true] Set false to suppress auto-registration with ConfigurationWidget
     */
    constructor(viewer, opts = {}) {
        super(viewer, opts);
        this.overlay = new PaperOverlay(viewer, { overlayType: 'image' });
        ensureNamedToolLayer(this.overlay.paperScope);

        // Same wiring as AnnotationToolkit: zoom-driven rescale for items with a `rescale` map.
        this.overlay.autoRescaleItems(true);

        this.tool = new FieldOfViewTool(this.overlay.paperScope, this);
        this.dummyTool = new this.overlay.paperScope.Tool();
        this.dummyTool.activate();

        this._mouseNavEnabledAtActivation = true;
        this._state = 'inactive';
        this._saveSettingsTimeout = null;
        /** @type {HTMLElement | null} */
        this._fovContextMenuEl = null;
        this._boundFovContextMenu = (ev) => this._onFovCanvasContextMenu(ev);
        this._fovContextMenuPointerDismiss = (e) => {
            if (!this._fovContextMenuEl || this._fovContextMenuEl.contains(e.target)) return;
            this._dismissFovContextMenu();
        };
        this._fovContextMenuKeyDismiss = (e) => {
            if (e.key === 'Escape') {
                this._dismissFovContextMenu();
            }
        };
        this._fovContextMenuBlurDismiss = () => {
            this._dismissFovContextMenu();
        };
        this._fovContextMenuScrollDismiss = () => {
            this._dismissFovContextMenu();
        };

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
            faIconClass: 'fa-binoculars',
            tooltip: 'Field of view',
            onClick: () => {
                this._active ? this.deactivate() : this.activate();
            },
        });
        this.button.element.querySelector('svg.icon')?.style.setProperty('width', '1em');

        this._makeDialog();

        // Context menu for dropped FOV rings: only this overlay's canvas receives the event; if another
        // PaperOverlay is stacked above, it captures pointer events first (same as any stacked canvas).
        const viewEl = this.overlay.paperScope.view.element;
        viewEl.addEventListener('contextmenu', this._boundFovContextMenu);
        this.viewer.addOnceHandler('destroy', () => {
            viewEl.removeEventListener('contextmenu', this._boundFovContextMenu);
            this._dismissFovContextMenu();
        });

        const worldCount = this.viewer.world?.getItemCount?.() ?? 0;
        fovOverlayLog('constructor done', {
            overlayType: this.overlay.overlayType,
            worldItemCount: worldCount,
            hasDropLayerHint: worldCount === 1 ? Boolean(this.getDropTargetLayer()) : null,
        });

        this._autoRegister();
    }

    activate() {
        const reactivate = this.overlay.setOSDMouseNavEnabled(false);
        this._mouseNavEnabledAtActivation = this._mouseNavEnabledAtActivation || reactivate;
        this.overlay.bringToFront();
        this._setActive(true);
        fovOverlayLog('activate', {
            setOSDMouseNavDisabled: true,
            reactivateHint: reactivate,
            worldItemCount: this.viewer.world?.getItemCount?.() ?? 0,
        });
        this.tool.activate();
        this.tool.setMode('idle');
        this._setState('config');
    }

    deactivate() {
        fovOverlayLog('deactivate');
        this._setActive(false);
        this._setState('inactive');
        this.tool.setMode('idle');
        this.tool.deactivate(true);
        this.dummyTool.activate();
        this.overlay.setOSDMouseNavEnabled(this._mouseNavEnabledAtActivation);
        this._mouseNavEnabledAtActivation = false;
        this.overlay.sendToBack();
    }

    /**
     * @returns {import('../../osd-loader.mjs').OpenSeadragon.TiledImage}
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
            const layer = this.overlay.getPaperLayer(ti) ?? null;
            fovOverlayLog('getDropTargetLayer', {
                mapSize: ti._paperLayerMap.size,
                hasLayer: Boolean(layer),
                layerName: layer?.name,
                tiledImageIndex: 0,
            });
            return layer;
        } catch (err) {
            fovOverlayLog('getDropTargetLayer failed', {
                message: err instanceof Error ? err.message : String(err),
            });
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

    _dismissFovContextMenu() {
        if (this._fovContextMenuEl) {
            this._fovContextMenuEl.remove();
            this._fovContextMenuEl = null;
        }
        document.removeEventListener('pointerdown', this._fovContextMenuPointerDismiss, true);
        window.removeEventListener('keydown', this._fovContextMenuKeyDismiss, true);
        window.removeEventListener('blur', this._fovContextMenuBlurDismiss);
        this.viewer.container?.removeEventListener('scroll', this._fovContextMenuScrollDismiss, true);
    }

    /**
     * @param {number} clientX
     * @param {number} clientY
     * @param {paper.Item} ringGroup
     */
    _openFovContextMenu(clientX, clientY, ringGroup) {
        this._dismissFovContextMenu();

        const wrap = document.createElement('div');
        wrap.className = 'fov-context-menu';
        wrap.setAttribute('role', 'menu');
        wrap.style.cssText =
            'position:fixed;z-index:100000;background:#fff;border:1px solid rgba(0,0,0,0.15);' +
            'border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.18);min-width:12rem;padding:4px 0;' +
            'font:13px system-ui,-apple-system,sans-serif;';

        const rowStyle =
            'display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:transparent;' +
            'cursor:pointer;font:inherit;color:#111;';
        const hoverOn = (b) => {
            b.style.background = 'rgba(0,0,0,0.06)';
        };
        const hoverOff = (b) => {
            b.style.background = 'transparent';
        };

        const fmt = (n, digits = 6) => {
            const x = Number(n);
            if (!Number.isFinite(x)) return '';
            const s = x.toFixed(digits);
            return s.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
        };

        const info = document.createElement('div');
        info.style.cssText =
            'padding:8px 12px 6px 12px;color:rgba(0,0,0,0.70);font:12px system-ui,-apple-system,sans-serif;line-height:1.25;';

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

        if (lines.length) {
            info.textContent = lines.join('\n');
            info.style.whiteSpace = 'pre-line';
            const sep = document.createElement('div');
            sep.style.cssText = 'height:1px;background:rgba(0,0,0,0.08);margin:4px 0;';
            wrap.append(info, sep);
        }

        const btnThis = document.createElement('button');
        btnThis.type = 'button';
        btnThis.textContent = 'Delete this field of view';
        btnThis.style.cssText = rowStyle;
        btnThis.addEventListener('mouseenter', () => hoverOn(btnThis));
        btnThis.addEventListener('mouseleave', () => hoverOff(btnThis));
        btnThis.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            ringGroup.remove();
            this.notifyFovRingGeometryChanged();
            this._dismissFovContextMenu();
        });

        const btnAll = document.createElement('button');
        btnAll.type = 'button';
        btnAll.textContent = 'Delete all';
        btnAll.style.cssText = rowStyle;
        btnAll.addEventListener('mouseenter', () => hoverOn(btnAll));
        btnAll.addEventListener('mouseleave', () => hoverOff(btnAll));
        btnAll.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.clearAllDroppedFieldOfViews();
            this._dismissFovContextMenu();
        });

        wrap.append(btnThis, btnAll);
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

        this._fovContextMenuEl = wrap;

        const arm = () => {
            document.addEventListener('pointerdown', this._fovContextMenuPointerDismiss, true);
            window.addEventListener('keydown', this._fovContextMenuKeyDismiss, true);
            window.addEventListener('blur', this._fovContextMenuBlurDismiss);
            this.viewer.container?.addEventListener('scroll', this._fovContextMenuScrollDismiss, true);
        };
        setTimeout(arm, 0);
    }

    /**
     * @param {MouseEvent} ev
     */
    _onFovCanvasContextMenu(ev) {
        this._dismissFovContextMenu();

        const view = this.overlay.paperScope.view;
        const layer = this.getDropTargetLayer();
        const viewEl = view.element;
        if (!layer || !viewEl.contains(ev.target)) return;

        const br = viewEl.getBoundingClientRect();
        const ox = ev.clientX - br.left;
        const oy = ev.clientY - br.top;
        const pt = view.viewToProject(new paper.Point(ox, oy));
        const tolerance = this._fovHitTolerance(view, layer);
        const hit = layer.hitTest(pt, {
            fill: true,
            stroke: true,
            segments: true,
            tolerance,
            match: (hr) => Boolean(this._findFovDroppedRingGroup(hr.item)),
        });
        const ring = hit ? this._findFovDroppedRingGroup(hit.item) : null;
        if (!ring) return;

        ev.preventDefault();
        ev.stopPropagation();
        this._openFovContextMenu(ev.clientX, ev.clientY, ring);
    }

    /**
     * @param {import('../../osd-loader.mjs').OpenSeadragon.Point} centerImg
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
        input.value = String(valueString ?? '');
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
        this._setIfNotFocused(diameterInput, String(this.settings.diameter));
        const aMm2 = areaMm2FromDiameterPhysical(this.settings.diameter, this.settings.unit);
        if (aMm2 != null) {
            this._setIfNotFocused(areaInput, this._formatAreaMm2ForInput(aMm2));
        } else if (areaInput && !this._isFocused(areaInput)) {
            areaInput.value = '';
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
        const html = `<div class="fov-dialog hidden">
            <div class="fov-dialog-full">
                <div class="fov-header">
                    <div class="fov-title">Field of view</div>
                    <button class="close fov-close" type="button" aria-label="Close">×</button>
                </div>
                <div class="fov-body">
                    <div class="fov-row">
                        <span class="fov-muted">Diameter</span>
                        <input class="fov-diameter" type="number" step="any" inputmode="decimal" />
                        <select class="fov-unit">
                            <option value="mm">mm</option>
                            <option value="um">µm</option>
                        </select>
                    </div>
                    <div class="fov-row">
                        <span class="fov-muted">Area</span>
                        <input class="fov-area-mm2" type="number" step="any" inputmode="decimal" />
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
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                box-sizing: border-box;
                width: min(360px, calc(100% - 24px));
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
            .fov-dialog.hidden{ display:none; }
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
                z-index: 50;
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
            .fov-header{
                display:flex;
                align-items:center;
                justify-content:space-between;
                padding: 10px 12px;
                border-bottom: 1px solid rgba(0,0,0,0.08);
                position: sticky;
                top: 0;
                background: #fff;
                z-index: 1;
            }
            .fov-title{ font-weight: 600; font-size: 14px; }
            .fov-close{
                border: none;
                background: transparent;
                font-size: 18px;
                line-height: 1;
                padding: 2px 6px;
                cursor: pointer;
                color: rgba(0,0,0,0.6);
            }
            .fov-close:hover{ color: rgba(0,0,0,0.9); }
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
            const parsed = this._parsePositiveFloatDraft(areaInput.value);
            if (parsed.ok) {
                const dPhys = diameterPhysicalFromAreaMm2(parsed.value, this.settings.unit);
                if (dPhys != null) {
                    this._setIfNotFocused(diameterInput, String(dPhys));
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
            fovOverlayLog('Place clicked', {
                diameterPx: px,
                unit: this.settings.unit,
                diameterPhysical: this.settings.diameter,
                mpp: this._getMppOrNull(),
            });
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
