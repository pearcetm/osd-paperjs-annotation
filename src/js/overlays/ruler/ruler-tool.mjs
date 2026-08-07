/**
 * Convenience ruler tool (ToolBase): create one two-point measurement, then modify endpoints/line.
 */

import { ToolBase } from '../../papertools/base.mjs';
import {
    annotationToolPrimaryButtonActiveDrag,
    annotationToolPrimaryButtonDownOrUp,
} from '../../papertools/annotationUITool.mjs';
import { paper } from '../../paperjs.mjs';
import { projectPointToImagePoint } from '../fieldofview/fieldofview-geometry.mjs';
import {
    buildSegmentGroup,
    findViewerRulerRoot,
    getPathFromSegmentChild,
    refreshSegmentLabel,
    SEGMENT_HALO,
    SEGMENT_PATH,
    wrapViewerRulerMeasurement,
    ZERO_LENGTH_EPSILON,
} from './ruler-segment.mjs';

const CROSSHAIR_SIZE_PX = 8;

export class RulerOverlayTool extends ToolBase {
    /**
     * @param {paper.PaperScope} paperScope
     * @param {*} rulerOverlay
     */
    constructor(paperScope, rulerOverlay) {
        super(paperScope);
        this.paperScope = this.project.paperScope;
        this._overlay = rulerOverlay;
        /** @type {'idle'|'creating'|'modifying'|'endpoint-drag'|'line-drag'} */
        this._mode = 'idle';
        this._firstPoint = null;
        this._didDrag = false;
        this._previewSegmentGroup = null;
        this._currentMeasurement = null;
        this._editPath = null;
        this._editSegmentIndex = null;
        this._scale = { unitsPerPixel: 1, labelUnit: 'px' };

        this.drawingGroup = new paper.Group();
        this.drawingGroup.visible = false;
        this.project.toolLayer.addChild(this.drawingGroup);

        this._crosshair = this._createCrosshair(CROSSHAIR_SIZE_PX / this.project.getZoom());
        this.project.toolLayer.addChild(this._crosshair);

        this.extensions.onActivate = () => {
            this.drawingGroup.visible = true;
            this.project.toolLayer.addChild(this.drawingGroup);
            this.project.toolLayer.addChild(this._crosshair);
            this.tool.minDistance = 0;
            this.tool.maxDistance = 0;
        };
        this.extensions.onDeactivate = () => {
            this._crosshair.visible = false;
            this._clearPlacementState();
            this.drawingGroup.visible = false;
            this._editPath = null;
            this._editSegmentIndex = null;
            this._clearCursorClasses();
            if (this._mode !== 'idle') {
                this._mode = 'idle';
            }
        };
    }

    setScale(scale) {
        this._scale = {
            unitsPerPixel: Number(scale?.unitsPerPixel) > 0 ? Number(scale.unitsPerPixel) : 1,
            labelUnit: scale?.labelUnit || 'px',
            decimals: scale?.decimals ?? 2,
            roundingMode: scale?.roundingMode ?? 'round',
        };
    }

    getScale() {
        return this._scale;
    }

    getMode() {
        return this._mode;
    }

    getCurrentMeasurement() {
        return this._currentMeasurement;
    }

    /**
     * @param {'idle'|'creating'|'modifying'} mode
     * @param {paper.Item|null} [measurement]
     */
    setMode(mode, measurement = null) {
        const next = mode || 'idle';
        if (next === 'creating') {
            this._clearPlacementState();
            this._currentMeasurement = null;
            this._mode = 'creating';
            this._crosshair.visible = true;
            this._clearCursorClasses();
            return;
        }
        if (next === 'modifying' && measurement) {
            this._clearPlacementState();
            this._currentMeasurement = measurement;
            this._mode = 'modifying';
            this._crosshair.visible = false;
            this._setMeasurementSelected(measurement, true);
            return;
        }
        this._clearPlacementState();
        if (this._currentMeasurement) {
            this._setMeasurementSelected(this._currentMeasurement, false);
        }
        this._currentMeasurement = null;
        this._mode = 'idle';
        this._crosshair.visible = false;
        this._clearCursorClasses();
    }

    /**
     * Abort in-progress create (remove unfinished measurement if any) and go idle.
     * @returns {boolean} true if an uncommitted item was removed
     */
    cancelCreating() {
        let removed = false;
        this._clearPlacementState();
        if (this._currentMeasurement && this._mode === 'creating') {
            // creating before commit should not have a measurement yet
        }
        if (this._mode === 'creating' || this._firstPoint) {
            removed = true;
        }
        this.setMode('idle');
        return removed;
    }

    /**
     * Finish measuring session: discard uncommitted draw; keep committed measurement deselected.
     * @returns {'discarded'|'kept'|'none'}
     */
    finishMeasuring() {
        if (this._mode === 'creating' || this._firstPoint) {
            this._clearPlacementState();
            if (this._currentMeasurement && !this._measurementHasCommittedSegment(this._currentMeasurement)) {
                this._currentMeasurement.remove();
                this._currentMeasurement = null;
                this.setMode('idle');
                return 'discarded';
            }
            if (this._currentMeasurement) {
                this._setMeasurementSelected(this._currentMeasurement, false);
            }
            this._currentMeasurement = null;
            this.setMode('idle');
            return 'discarded';
        }
        if (this._mode === 'modifying' || this._mode === 'endpoint-drag' || this._mode === 'line-drag') {
            if (this._currentMeasurement) {
                this._setMeasurementSelected(this._currentMeasurement, false);
            }
            this._currentMeasurement = null;
            this.setMode('idle');
            return 'kept';
        }
        this.setMode('idle');
        return 'none';
    }

    _measurementHasCommittedSegment(measurement) {
        if (!measurement?.children?.length) return false;
        const seg = measurement.children[0];
        const path = getPathFromSegmentChild(seg);
        if (!path || path.segments.length < 2) return false;
        return path.segments[0].point.getDistance(path.segments[1].point) >= ZERO_LENGTH_EPSILON;
    }

    _setMeasurementSelected(measurement, selected) {
        if (!measurement) return;
        const seg = measurement.children?.[0];
        const path = getPathFromSegmentChild(seg);
        if (path) path.selected = !!selected;
    }

    _zoomFactor() {
        return this.project.getZoom() || 1;
    }

    _toImagePoint(projectPoint) {
        return projectPointToImagePoint(this._overlay.viewer, this.paperScope, projectPoint);
    }

    _createCrosshair(size) {
        const g = new paper.Group({ visible: false });
        const mk = (a, b, color, dash) => {
            const p = new paper.Path({
                segments: [a, b],
                strokeScaling: false,
                strokeWidth: 1,
                strokeColor: color,
            });
            if (dash) p.dashArray = dash;
            return p;
        };
        const h1 = mk(new paper.Point(-size, 0), new paper.Point(size, 0), 'black');
        const h2 = mk(new paper.Point(-size, 0), new paper.Point(size, 0), 'white', [3, 3]);
        const v1 = mk(new paper.Point(0, -size), new paper.Point(0, size), 'black');
        const v2 = mk(new paper.Point(0, -size), new paper.Point(0, size), 'white', [3, 3]);
        g.addChildren([h1, h2, v1, v2]);
        return g;
    }

    _setCrosshairPosition(point) {
        const view = this.tool.view;
        const pt = view.projectToView(point);
        const half = CROSSHAIR_SIZE_PX;
        const left = view.viewToProject(new paper.Point(pt.x - half, pt.y));
        const right = view.viewToProject(new paper.Point(pt.x + half, pt.y));
        const top = view.viewToProject(new paper.Point(pt.x, pt.y - half));
        const bottom = view.viewToProject(new paper.Point(pt.x, pt.y + half));
        const [h1, h2, v1, v2] = this._crosshair.children;
        h1.segments[0].point = left;
        h2.segments[0].point = left;
        h1.segments[1].point = right;
        h2.segments[1].point = right;
        v1.segments[0].point = top;
        v2.segments[0].point = top;
        v1.segments[1].point = bottom;
        v2.segments[1].point = bottom;
    }

    _clearPlacementState() {
        this._firstPoint = null;
        this._didDrag = false;
        if (this._previewSegmentGroup?.parent) this._previewSegmentGroup.remove();
        this._previewSegmentGroup = null;
        this.drawingGroup.removeChildren();
    }

    _clearCursorClasses() {
        const ol = this.project.overlay;
        ol?.removeClass?.('rectangle-tool-resize', 'rectangle-tool-move');
    }

    /**
     * Preview lives on toolLayer (project space); label length must use image pixels.
     * @param {paper.Group} segmentGroup
     */
    _refreshPreviewLabel(segmentGroup) {
        if (!segmentGroup || segmentGroup.children.length !== 3) return;
        const path = segmentGroup.children[SEGMENT_PATH];
        if (!path || path.segments.length < 2) return;
        const p1Img = this._toImagePoint(path.segments[0].point);
        const p2Img = this._toImagePoint(path.segments[1].point);
        const distance = Math.hypot(p2Img.x - p1Img.x, p2Img.y - p1Img.y);
        refreshSegmentLabel(segmentGroup, this._scale, distance);
    }

    _hitViewerRuler(projectPoint) {
        const layer = this._overlay.getDropTargetLayer();
        if (!layer || !projectPoint) return null;
        const tol = this.getTolerance(5);
        const hit = layer.hitTest(projectPoint, {
            fill: true,
            stroke: true,
            segments: true,
            tolerance: tol,
            match: (hr) => Boolean(findViewerRulerRoot(hr.item)),
        });
        return hit ? findViewerRulerRoot(hit.item) : null;
    }

    hitTestMeasurementAtProjectPoint(projectPoint) {
        return this._hitViewerRuler(projectPoint);
    }

    _commitSegment(p1Project, p2Project) {
        const layer = this._overlay.getDropTargetLayer();
        if (!layer) return null;
        const p1Img = this._toImagePoint(p1Project);
        const p2Img = this._toImagePoint(p2Project);
        const p1 = new paper.Point(p1Img.x, p1Img.y);
        const p2 = new paper.Point(p2Img.x, p2Img.y);
        if (p1.getDistance(p2) < ZERO_LENGTH_EPSILON) return null;

        const segmentGroup = buildSegmentGroup(p1, p2, {
            preview: false,
            zoomFactor: this._zoomFactor(),
            scale: this._scale,
        });
        refreshSegmentLabel(segmentGroup, this._scale);
        const measurement = wrapViewerRulerMeasurement(segmentGroup);
        layer.addChild(measurement);
        if (segmentGroup.applyRescale) segmentGroup.applyRescale();
        segmentGroup.children.forEach((c) => c.applyRescale?.());
        refreshSegmentLabel(segmentGroup, this._scale);

        this._clearPlacementState();
        this._currentMeasurement = null;
        this._mode = 'idle';
        this._crosshair.visible = false;
        this._clearCursorClasses();
        this._overlay.notifyMeasurementCommitted?.(measurement);
        return measurement;
    }

    onMouseDown(ev) {
        if (!annotationToolPrimaryButtonDownOrUp(ev)) return;

        if (this._mode === 'modifying' && this._currentMeasurement) {
            const seg = this._currentMeasurement.children[0];
            const path = getPathFromSegmentChild(seg);
            if (!path) return;
            const tol = this.getTolerance(5, this._currentMeasurement);
            // Hit in image space: convert project point to image
            const imgPt = this._toImagePoint(ev.point);
            const local = new paper.Point(imgPt.x, imgPt.y);
            const segHit = path.hitTest(local, { fill: false, stroke: false, segments: true, tolerance: tol });
            if (segHit && segHit.type === 'segment') {
                this._editPath = path;
                this._editSegmentIndex = path.segments.indexOf(segHit.segment);
                this._mode = 'endpoint-drag';
                return;
            }
            const strokeHit = path.hitTest(local, { fill: false, stroke: true, segments: false, tolerance: tol });
            if (strokeHit) {
                this._editPath = path;
                this._mode = 'line-drag';
                this._lineDragLastImg = local.clone();
                return;
            }
            // Click elsewhere: deselect and return to idle
            this.finishMeasuring();
            this._overlay.notifyToolIdle?.();
            return;
        }

        if (this._mode === 'idle') {
            const hit = this._hitViewerRuler(ev.point);
            if (hit) {
                this.setMode('modifying', hit);
                this._overlay.notifyEnteredModify?.();
            }
            return;
        }

        if (this._mode !== 'creating') return;

        if (this._firstPoint === null) {
            this._firstPoint = ev.point.clone();
            this._previewSegmentGroup = buildSegmentGroup(this._firstPoint.clone(), this._firstPoint.clone(), {
                preview: true,
                zoomFactor: this._zoomFactor(),
                scale: this._scale,
            });
            this.drawingGroup.removeChildren();
            this.drawingGroup.addChild(this._previewSegmentGroup);
            const previewPath = this._previewSegmentGroup.children[SEGMENT_PATH];
            if (previewPath) previewPath.selected = true;
            this._didDrag = false;
            return;
        }

        if (!this._didDrag) {
            this._commitSegment(this._firstPoint, ev.point);
        }
    }

    onMouseMove(ev) {
        if (this._mode === 'creating') {
            this._crosshair.visible = true;
            this._setCrosshairPosition(ev.point);
        }

        if (this._mode === 'modifying' && this._currentMeasurement) {
            const ol = this.project.overlay;
            const seg = this._currentMeasurement.children[0];
            const path = getPathFromSegmentChild(seg);
            if (path && ol?.addClass) {
                const imgPt = this._toImagePoint(ev.point);
                const local = new paper.Point(imgPt.x, imgPt.y);
                const tol = this.getTolerance(5, this._currentMeasurement);
                const segHit = path.hitTest(local, { fill: false, stroke: false, segments: true, tolerance: tol });
                if (segHit) {
                    ol.addClass('rectangle-tool-resize');
                    ol.removeClass('rectangle-tool-move');
                } else {
                    const strokeHit = path.hitTest(local, { fill: false, stroke: true, segments: false, tolerance: tol });
                    if (strokeHit) {
                        ol.addClass('rectangle-tool-move');
                        ol.removeClass('rectangle-tool-resize');
                    } else {
                        this._clearCursorClasses();
                    }
                }
            }
        }

        if (this._firstPoint && this._previewSegmentGroup) {
            const path = this._previewSegmentGroup.children[SEGMENT_PATH];
            const haloPath = this._previewSegmentGroup.children[SEGMENT_HALO];
            if (path) path.segments[1].point = ev.point.clone();
            if (haloPath?.segments?.length === 2) haloPath.segments[1].point = ev.point.clone();
            this._refreshPreviewLabel(this._previewSegmentGroup);
        }
    }

    onMouseDrag(ev) {
        if (!annotationToolPrimaryButtonActiveDrag(ev)) return;

        if (this._mode === 'endpoint-drag' && this._editPath) {
            const imgPt = this._toImagePoint(ev.point);
            this._editPath.segments[this._editSegmentIndex].point = new paper.Point(imgPt.x, imgPt.y);
            const parent = this._editPath.parent;
            if (parent instanceof paper.Group) {
                const haloPath = parent.children[SEGMENT_HALO];
                if (haloPath instanceof paper.Path && haloPath.segments.length === this._editPath.segments.length) {
                    haloPath.segments[this._editSegmentIndex].point = new paper.Point(imgPt.x, imgPt.y);
                }
                refreshSegmentLabel(parent, this._scale);
            }
            return;
        }

        if (this._mode === 'line-drag' && this._editPath && this._lineDragLastImg) {
            const imgPt = this._toImagePoint(ev.point);
            const cur = new paper.Point(imgPt.x, imgPt.y);
            const delta = cur.subtract(this._lineDragLastImg);
            this._lineDragLastImg = cur;
            this._editPath.segments.forEach((s) => {
                s.point = s.point.add(delta);
            });
            const parent = this._editPath.parent;
            if (parent instanceof paper.Group) {
                const haloPath = parent.children[SEGMENT_HALO];
                if (haloPath instanceof paper.Path) {
                    haloPath.segments.forEach((s, i) => {
                        s.point = this._editPath.segments[i].point.clone();
                    });
                }
                refreshSegmentLabel(parent, this._scale);
            }
            return;
        }

        if (this._mode === 'creating' && this._firstPoint && this._previewSegmentGroup) {
            this._didDrag = true;
            const path = this._previewSegmentGroup.children[SEGMENT_PATH];
            const haloPath = this._previewSegmentGroup.children[SEGMENT_HALO];
            if (path) path.segments[1].point = ev.point.clone();
            if (haloPath?.segments?.length === 2) haloPath.segments[1].point = ev.point.clone();
            this._refreshPreviewLabel(this._previewSegmentGroup);
        }
    }

    onMouseUp(ev) {
        if (!annotationToolPrimaryButtonDownOrUp(ev)) return;

        if (this._mode === 'endpoint-drag' || this._mode === 'line-drag') {
            this._mode = 'modifying';
            this._editPath = null;
            this._editSegmentIndex = null;
            this._lineDragLastImg = null;
            return;
        }

        if (this._mode === 'creating' && this._didDrag && this._firstPoint) {
            this._commitSegment(this._firstPoint, ev.point);
        }
    }
}
