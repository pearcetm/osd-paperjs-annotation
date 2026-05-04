/**
 * Field of view placement tool: preview on toolLayer, commits circles on the tiled image Paper layer.
 */

import { ToolBase } from '../../papertools/base.mjs';
import {
    annotationToolPrimaryButtonActiveDrag,
    annotationToolPrimaryButtonDownOrUp,
} from '../../papertools/annotationUITool.mjs';
import { paper } from '../../paperjs.mjs';
import { circlePreviewGeometryFromProjectPoint, projectPointToImagePoint } from './fieldofview-geometry.mjs';

/** White halo stroke (px, logical; no rescale on toolLayer preview). */
const FOV_PREVIEW_UNDER_STROKE = 4;
/** Black dashed stroke on top of halo (px). */
const FOV_PREVIEW_OVER_STROKE = 2;
const FOV_DASH_ARRAY = [6, 4];

/** Dropped ring: same visual weights, in image space with rescale (see applyRescale). */
const FOV_DROP_UNDER_STROKE = 3;
const FOV_DROP_OVER_STROKE = 1.5;

/**
 * Nearly invisible fill so hitTest / selection see the disk interior (Paper.js null fill skips fill hits).
 * @see https://github.com/paperjs/paper.js/issues — stroke-only circles are hard to pick
 */
const FOV_HIT_FILL_ALPHA = 0.0001;

/**
 * @param {paper.Group} group
 * @param {paper.Shape.Circle} under
 * @param {paper.Shape.Circle} over
 */
function stylePreviewRing(group, under, over) {
    under.strokeColor = new paper.Color(1, 1, 1);
    under.strokeWidth = FOV_PREVIEW_UNDER_STROKE;
    under.fillColor = null;
    under.rescale = { strokeWidth: FOV_PREVIEW_UNDER_STROKE };

    over.strokeColor = new paper.Color(0, 0, 0);
    over.strokeWidth = FOV_PREVIEW_OVER_STROKE;
    over.dashArray = FOV_DASH_ARRAY.slice();
    over.fillColor = null;
    over.rescale = { strokeWidth: FOV_PREVIEW_OVER_STROKE, dashArray: FOV_DASH_ARRAY.slice() };

    group.applyMatrix = false;
}

/**
 * @param {paper.Path.Circle} under
 */
function styleDroppedUnder(under) {
    under.strokeColor = new paper.Color(1, 1, 1);
    under.strokeWidth = FOV_DROP_UNDER_STROKE;
    under.fillColor = new paper.Color(1, 1, 1, FOV_HIT_FILL_ALPHA);
    under.rescale = { strokeWidth: FOV_DROP_UNDER_STROKE };
}

/**
 * @param {paper.Path.Circle} over
 */
function styleDroppedOver(over) {
    over.strokeColor = new paper.Color(0, 0, 0);
    over.strokeWidth = FOV_DROP_OVER_STROKE;
    over.fillColor = null;
    over.rescale = {
        strokeWidth: FOV_DROP_OVER_STROKE
    };
}

/**
 * @returns {{ group: paper.Group, under: paper.Shape.Circle, over: paper.Shape.Circle }}
 */
function createPreviewRingGroup() {
    const group = new paper.Group();
    group.name = 'fovPreviewRing';
    const under = new paper.Shape.Circle(new paper.Point(0, 0), 1);
    const over = new paper.Shape.Circle(new paper.Point(0, 0), 1);
    group.addChild(under);
    group.addChild(over);
    stylePreviewRing(group, under, over);
    return { group, under, over };
}

/**
 * @param {number} radiusImg
 * @returns {{ group: paper.Group, under: paper.Path.Circle, over: paper.Path.Circle }}
 */
function createDroppedRingGroup(radiusImg) {
    const group = new paper.Group();
    group.name = 'fovDroppedRing';
    group.applyMatrix = false;
    const under = new paper.Path.Circle({
        center: new paper.Point(0, 0),
        radius: radiusImg,
    });
    const over = new paper.Path.Circle({
        center: new paper.Point(0, 0),
        radius: radiusImg,
    });
    group.addChild(under);
    group.addChild(over);
    styleDroppedUnder(under);
    styleDroppedOver(over);
    return { group, under, over };
}

export class FieldOfViewTool extends ToolBase {
    /**
     * @param {paper.PaperScope} paperScope
     * @param {*} fovOverlay - FieldOfViewOverlay instance (`viewer`, `getDropTargetLayer`, `buildDropItemData`)
     */
    constructor(paperScope, fovOverlay) {
        super(paperScope);
        /** Same object as ToolBase `this.project.paperScope`; local shorthand (same pattern as wand tool). */
        this.paperScope = this.project.paperScope;
        this._fov = fovOverlay;
        this._mode = 'idle';
        this._diameterPx = null;
        /** @type {{ ring: paper.Item, offsetImg: paper.Point } | null} */
        this._editDrag = null;

        const preview = createPreviewRingGroup();
        this._previewGroup = preview.group;
        this._previewUnder = preview.under;
        this._previewOver = preview.over;
        this._previewGroup.visible = false;
        this.project.toolLayer.addChild(this._previewGroup);
        this._debugLastMoveLog = 0;

        this.tool.extensions.onKeyDown = (ev) => {
            if (ev.key === 'escape') {
                fovOverlay.deactivate();
            }
        };
        this.extensions.onActivate = () => {
            this._active = true;
            this._syncPreviewVisibility();
        };
        this.extensions.onDeactivate = () => {
            this._active = false;
            this._previewGroup.visible = false;
            this._clearFovEditInteractionState();
        };
    }

    /**
     * Clears edit drag + canvas cursor classes (e.g. compact “+” returns to full config while overlay stays active).
     */
    clearEditUiState() {
        this._clearFovEditInteractionState();
    }

    setMode(mode) {
        const next = mode || 'idle';
        if (this._mode === 'editing' && next !== 'editing') {
            this._clearFovEditInteractionState();
        }
        this._mode = next;
        this._syncPreviewVisibility();
    }

    setDiameterPixels(diameterPx) {
        const n = Number(diameterPx);
        this._diameterPx = Number.isFinite(n) && n > 0 ? n : null;
        this._syncPreviewVisibility();
    }

    _clearFovEditInteractionState() {
        this._editDrag = null;
        const ol = this.project?.overlay;
        if (ol?.removeClass) {
            ol.removeClass('fov-edit-hover', 'fov-edit-grabbing');
        }
    }

    _syncEditHover(projectPoint) {
        const ol = this.project.overlay;
        if (!ol?.addClass) return;
        const ring = this._fov.hitTestFovRingAtProjectPoint(projectPoint);
        if (ring) {
            ol.addClass('fov-edit-hover');
        } else {
            ol.removeClass('fov-edit-hover');
        }
    }

    _moveRingToProjectPoint(ring, projectPoint) {
        if (!ring || !projectPoint) return;
        const dPx = Number(ring.data?.diameterPx);
        if (!Number.isFinite(dPx) || dPx <= 0) return;
        const centerImg = projectPointToImagePoint(this._fov.viewer, this.paperScope, projectPoint);
        if (
            !Number.isFinite(centerImg.x) ||
            !Number.isFinite(centerImg.y) ||
            Number.isNaN(centerImg.x) ||
            Number.isNaN(centerImg.y)
        ) {
            return;
        }
        ring.position = new paper.Point(centerImg.x, centerImg.y);
        ring.data = this._fov.buildDropItemData(centerImg, dPx);
    }

    onMouseDown(ev) {
        if (this._mode !== 'editing') return;
        if (!annotationToolPrimaryButtonDownOrUp(ev)) return;
        const ring = this._fov.hitTestFovRingAtProjectPoint(ev.point);
        if (!ring) return;
        const downImg = projectPointToImagePoint(this._fov.viewer, this.paperScope, ev.point);
        if (
            !Number.isFinite(downImg.x) ||
            !Number.isFinite(downImg.y) ||
            Number.isNaN(downImg.x) ||
            Number.isNaN(downImg.y)
        ) {
            return;
        }
        // Preserve initial cursor-to-center offset (in image space) so the ring does not jump on drag.
        const offsetImg = ring.position.subtract(new paper.Point(downImg.x, downImg.y));
        this._editDrag = { ring, offsetImg };
        const ol = this.project.overlay;
        ol.removeClass('fov-edit-hover');
        ol.addClass('fov-edit-grabbing');
    }

    onMouseMove(ev) {
        if (this._mode === 'placing') {
            this._updatePreviewAt(ev.point);
            return;
        }
        if (this._mode !== 'editing') {
            this.project.overlay.removeClass('fov-edit-hover');
            return;
        }
        if (!this._editDrag) {
            this._syncEditHover(ev.point);
        }
    }

    onMouseDrag(ev) {
        if (this._mode !== 'editing') return;
        if (!annotationToolPrimaryButtonActiveDrag(ev)) return;
        const drag = this._editDrag;
        if (!drag?.ring) return;

        const dPx = Number(drag.ring.data?.diameterPx);
        if (!Number.isFinite(dPx) || dPx <= 0) return;

        const curImg = projectPointToImagePoint(this._fov.viewer, this.paperScope, ev.point);
        if (
            !Number.isFinite(curImg.x) ||
            !Number.isFinite(curImg.y) ||
            Number.isNaN(curImg.x) ||
            Number.isNaN(curImg.y)
        ) {
            return;
        }

        const center = new paper.Point(curImg.x, curImg.y).add(drag.offsetImg);
        drag.ring.position = center;
        drag.ring.data = this._fov.buildDropItemData({ x: center.x, y: center.y }, dPx);
    }

    onMouseUp(ev) {
        if (this._mode === 'placing') {
            if (!annotationToolPrimaryButtonDownOrUp(ev)) return;
            this._dropAt(ev.point);
            return;
        }
        if (this._mode === 'editing' && this._editDrag && annotationToolPrimaryButtonDownOrUp(ev)) {
            this._editDrag = null;
            this.project.overlay.removeClass('fov-edit-grabbing');
            this._syncEditHover(ev.point);
        }
    }

    _syncPreviewVisibility() {
        if (!this._active) {
            return;
        }
        const show = this._mode === 'placing' && this._diameterPx != null;
        this._previewGroup.visible = Boolean(show);
    }

    _updatePreviewAt(projectPoint) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const throttleMs = 300;
        const doLog = now - (this._debugLastMoveLog || 0) > throttleMs;
        if (doLog) this._debugLastMoveLog = now;

        if (!projectPoint || this._diameterPx == null) {
            return;
        }
        const g = circlePreviewGeometryFromProjectPoint(
            this._fov.viewer,
            this.paperScope,
            projectPoint,
            this._diameterPx,
        );
        if (!g) {
            return;
        }
        const r = Math.max(0.5, g.radiusProj);
        this._previewGroup.position = g.centerProj;
        this._previewUnder.radius = r;
        this._previewOver.radius = r;
        this._previewGroup.visible = true;
    }

    _dropAt(projectPoint) {
        if (this._diameterPx == null) {
            return;
        }
        const layer = this._fov.getDropTargetLayer();
        if (!layer) {
            return;
        }
        const g = circlePreviewGeometryFromProjectPoint(
            this._fov.viewer,
            this.paperScope,
            projectPoint,
            this._diameterPx,
        );
        if (!g) {
            return;
        }

        const radiusImg = this._diameterPx / 2;
        const { group: ring, under, over } = createDroppedRingGroup(radiusImg);
        ring.position = new paper.Point(g.centerImg.x, g.centerImg.y);
        ring.data = this._fov.buildDropItemData(g.centerImg, this._diameterPx);
        layer.addChild(ring);
        under.applyRescale();
        over.applyRescale();
        this._fov.notifyFovRingGeometryChanged?.();
    }
}
