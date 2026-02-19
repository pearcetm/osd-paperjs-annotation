/**
 * OpenSeadragon paperjs overlay plugin based on paper.js
 * @version 0.4.13
 *
 * Includes additional open source libraries which are subject to copyright notices
 * as indicated accompanying those segments of code.
 *
 * Original code:
 * Copyright (c) 2022-2024, Thomas Pearce
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * * Neither the name of osd-paperjs-annotation nor the names of its
 *   contributors may be used to endorse or promote products derived from
 *   this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */

import { AnnotationUITool, AnnotationUIToolbarBase } from './annotationUITool.mjs';
import { paper } from '../paperjs.mjs';
import { makeFaIcon } from '../utils/faIcon.mjs';

const ZERO_LENGTH_EPSILON = 1e-6;
const CROSSHAIR_SIZE_PX = 8;
const RULER_LABEL_FONT_SIZE = 12;
const RULER_LABEL_GAP_PX = 4; // Gap between line and label in screen pixels (zoom-independent)

/**
 * Ruler tool: two-point measurement. Extends AnnotationUITool only.
 * Creates segments with exactly two points (click-move-click or click-drag).
 * Line width is in screen pixels (zoom-independent via rescale).
 * Displays P1, P2, and distance in toolbar.
 *
 * @extends AnnotationUITool
 * @class
 * @memberof OSDPaperjsAnnotation
 */
class RulerTool extends AnnotationUITool {
    constructor(paperScope) {
        super(paperScope);
        this.setToolbarControl(new RulerToolbar(this));

        // Config and placement state
        this.strokeWidthPixels = 2;
        this._firstPoint = null;
        this._previewPath = null;
        this._didDrag = false;
        this._lastMeasurement = { p1: null, p2: null, distance: null };

        // Selection tracking (for onSelectionChanged)
        this._currentItem = null;
        this._drawingItem = null;

        // Editing mode: 'creating' | 'modifying' | 'endpoint-drag' | 'line-drag'
        this.mode = null;
        this._editPath = null;
        this._editSegmentIndex = null;

        // Drawing group: transient preview; moved to targetLayer on activate, back to toolLayer on deactivate
        this.drawingGroup = new paper.Group();
        this.drawingGroup.visible = false;
        this.project.toolLayer.addChild(this.drawingGroup);

        // Crosshair cursor (size recomputed from CROSSHAIR_SIZE_PX in setCrosshairPosition)
        const crosshairSize = CROSSHAIR_SIZE_PX / this.project.getZoom();
        this._crosshair = this._createCrosshair(crosshairSize);
        this.project.toolLayer.addChild(this._crosshair);

        // Activate / deactivate
        this.extensions.onActivate = () => {
            this.drawingGroup.visible = true;
            this.targetLayer.addChild(this.drawingGroup);
            this._currentItem = this.item;
            this.tool.minDistance = 0;
            this.tool.maxDistance = 0;
            const view = this.tool.view;
            const center = view.viewToProject(new paper.Point(view.viewSize.width / 2, view.viewSize.height / 2));
            this.setCrosshairPosition(center);
            this._updateModeAndCrosshair();
        };

        this.extensions.onDeactivate = (finished) => {
            this._crosshair.visible = false;
            this.mode = null;
            this._editPath = null;
            this._editSegmentIndex = null;
            this.project.overlay.removeClass('rectangle-tool-resize', 'rectangle-tool-move');
            if (finished) {
                this._clearPlacementState();
                this.drawingGroup.removeChildren();
                this.drawingGroup.visible = false;
                this.project.toolLayer.addChild(this.drawingGroup);
                this._currentItem = null;
                this.toolbarControl.updateMeasurement(null, null, null);
            }
        };

        // No erase or polygon; key handlers are no-ops
        this.tool.extensions.onKeyDown = () => {};
        this.tool.extensions.onKeyUp = () => {};
    }

    /**
     * Build crosshair group (four paths) for cursor feedback.
     * @private
     */
    _createCrosshair(size) {
        const g = new paper.Group({ visible: false });
        const h1 = new paper.Path({
            segments: [new paper.Point(-size, 0), new paper.Point(size, 0)],
            strokeScaling: false,
            strokeWidth: 1,
            strokeColor: 'black',
        });
        const h2 = new paper.Path({
            segments: [new paper.Point(-size, 0), new paper.Point(size, 0)],
            strokeScaling: false,
            strokeWidth: 1,
            strokeColor: 'white',
            dashArray: [3, 3],
        });
        const v1 = new paper.Path({
            segments: [new paper.Point(0, -size), new paper.Point(0, size)],
            strokeScaling: false,
            strokeWidth: 1,
            strokeColor: 'black',
        });
        const v2 = new paper.Path({
            segments: [new paper.Point(0, -size), new paper.Point(0, size)],
            strokeScaling: false,
            strokeWidth: 1,
            strokeColor: 'white',
            dashArray: [3, 3],
        });
        g.addChildren([h1, h2, v1, v2]);
        return g;
    }

    /**
     * Clear placement state and remove preview path from scene.
     * @private
     */
    _clearPlacementState() {
        this._firstPoint = null;
        this._didDrag = false;
        this._drawingItem = null;
        if (this._previewPath && this._previewPath.parent) {
            this._previewPath.remove();
        }
        this._previewPath = null;
    }

    /**
     * Ensure we have an item to draw into (create MultiLineString from itemToCreate if needed).
     * @private
     * @returns {boolean} true if this.item is available
     */
    _ensureItemForDrawing() {
        if (this.itemToCreate) {
            this.itemToCreate.initializeGeoJSONFeature('MultiLineString');
            this.refreshItems();
            this._setTargetLayer();
            if (this.isActive()) {
                this.targetLayer.addChild(this.drawingGroup);
            }
        }
        return !!this.item;
    }

    /**
     * Resolve the path from a segment child (group with path at [0], or legacy path).
     * @private
     * @param {paper.Item} child - segment group (Group with path at children[0]) or legacy Path
     * @returns {paper.Path|null}
     */
    _getPathFromSegmentChild(child) {
        if (!child) return null;
        if (child instanceof paper.Path) return child;
        if (child instanceof paper.Group && child.children.length > 0) return child.children[0];
        return null;
    }

    /**
     * Create or update the distance label for a segment group. Group has path at children[0], label at children[1].
     * @private
     * @param {paper.Group} segmentGroup - group with path at children[0]
     */
    _ensurePathLabel(segmentGroup) {
        const path = this._getPathFromSegmentChild(segmentGroup);
        if (!path || path.segments.length < 2) return;
        const p1 = path.segments[0].point;
        const p2 = path.segments[1].point;
        const distance = p1.getDistance(p2);
        const midpoint = p1.add(p2).divide(2);
        const formatted = this.toolbarControl && typeof this.toolbarControl.formatNum === 'function'
            ? this.toolbarControl.formatNum(distance)
            : (distance == null || typeof distance !== 'number' ? '—' : distance.toFixed(2));

        if (segmentGroup.children.length > 1 && typeof segmentGroup.children[1].content !== 'undefined') {
            const label = segmentGroup.children[1];
            label.justification = 'center';
            label.content = formatted;
            if (label.applyRescale) label.applyRescale();
            const placementCenter = this._computeLabelPlacementCenter(label, p1, p2, midpoint);
            this._centerLabelOnPoint(label, placementCenter);
            return;
        }

        const label = new paper.PointText({
            point: midpoint,
            content: formatted,
            fontSize: RULER_LABEL_FONT_SIZE,
            fillColor: path.strokeColor || new paper.Color('black'),
            justification: 'center',
        });
        label.rescale = { fontSize: (z) => RULER_LABEL_FONT_SIZE / z };
        segmentGroup.addChild(label);
        if (label.applyRescale) label.applyRescale();
        const placementCenter = this._computeLabelPlacementCenter(label, p1, p2, midpoint);
        this._centerLabelOnPoint(label, placementCenter);
    }

    /**
     * Compute placement center for label offset above segment (constant pixel gap, zoom-aware).
     * @private
     * @param {paper.PointText} label - label with bounds set (after applyRescale)
     * @param {paper.Point} p1 - segment start point
     * @param {paper.Point} p2 - segment end point
     * @param {paper.Point} midpoint - segment midpoint
     * @returns {paper.Point} placement center (midpoint if segment too short, otherwise offset above)
     */
    _computeLabelPlacementCenter(label, p1, p2, midpoint) {
        const segmentDir = p2.subtract(p1);
        const segmentLength = segmentDir.length;
        if (segmentLength < 1e-6) return midpoint; // Degenerate segment: use midpoint

        const normalizedDir = segmentDir.normalize();
        // Normal pointing "above" (90° counter-clockwise from segment direction)
        const normal = new paper.Point(normalizedDir.y, -normalizedDir.x);

        // Get zoom factor (same convention as PointText / applyRescale)
        const zoomFactor = label.view.scaling.x * label.layer.scaling.x;
        const gapPaper = RULER_LABEL_GAP_PX / zoomFactor;

        // Offset: half label height (already zoom-aware via rescale) + gap (constant pixels)
        const offset = label.bounds.height / 2 + gapPaper;
        return midpoint.add(normal.multiply(offset));
    }

    /**
     * Position a PointText so its visual center is at the given point (like PointText annotation).
     * @private
     * @param {paper.PointText} label - label with justification 'center'
     * @param {paper.Point} centerPoint - desired center position
     */
    _centerLabelOnPoint(label, centerPoint) {
        if (!label.bounds) return;
        const h = label.bounds.height;
        label.point = new paper.Point(centerPoint.x, centerPoint.y + h / 2);
    }

    /**
     * Ensure every segment has a group (path + label). Migrate legacy paths (direct children) to segment groups.
     * @private
     */
    _ensureItemLabels() {
        if (!this.item || !this.item.children.length) return;
        const toProcess = this.item.children.slice();
        toProcess.forEach((child, index) => {
            if (child instanceof paper.Path) {
                const path = child;
                const group = new paper.Group();
                group.addChild(path);
                this.item.removeChild(path);
                this.item.insertChild(index, group);
                this._ensurePathLabel(group);
            } else if (child instanceof paper.Group) {
                this._ensurePathLabel(child);
            }
        });
    }

    /**
     * Set mode (creating vs modifying) and crosshair visibility; when modifying, sync _lastMeasurement from first path.
     * @private
     */
    _updateModeAndCrosshair() {
        const creating = this.itemToCreate ||
            this._firstPoint !== null ||
            (this.item && this.item.children.length === 0);
        this.mode = creating ? 'creating' : (this.item && this.item.children.length > 0 ? 'modifying' : null);
        this._crosshair.visible = this.mode === 'creating';
        if (this.mode === 'modifying' && this.item && this.item.children.length > 0) {
            const path = this._getPathFromSegmentChild(this.item.children[0]);
            if (!path || path.segments.length < 2) return;
            const p1 = path.segments[0].point;
            const p2 = path.segments[1].point;
            const distance = p1.getDistance(p2);
            this._lastMeasurement = { p1, p2, distance };
            this.toolbarControl.updateMeasurement(p1, p2, distance);
        }
        if (this.toolbarControl.updateInstructions) {
            this.toolbarControl.updateInstructions(this.mode);
        }
        if (this.mode === 'modifying' && this.item && this.item.children.length > 0) {
            this._ensureItemLabels();
        }
    }

    onSelectionChanged() {
        if (this.item === this._currentItem) return;
        // In-progress placement: selection "changed" to the item we're drawing into (e.g. placeholder → new item) or to null
        if (this._firstPoint !== null && this._drawingItem) {
            if (this.item === this._drawingItem) {
                this._currentItem = this.item;
                this.targetLayer.addChild(this.drawingGroup);
                return;
            }
            if (this.item == null) {
                this._currentItem = this.item;
                const layer = this._drawingItem.layer || this.targetLayer;
                layer.addChild(this.drawingGroup);
                return;
            }
        }
        this._clearPlacementState();
        this.drawingGroup.removeChildren();
        this.toolbarControl.updateMeasurement(null, null, null);
        this._currentItem = this.item;
        this.targetLayer.addChild(this.drawingGroup);
        this._updateModeAndCrosshair();
    }

    /**
     * Zoom factor for stroke width (matches paper-extensions rescale convention).
     * @returns {number}
     */
    getZoomFactor() {
        return this.targetLayer.scaling.x * this.project.getZoom();
    }

    setStrokeWidthPixels(n) {
        this.strokeWidthPixels = Math.max(1, parseInt(n, 10) || 1);
    }

    /**
     * Position crosshair at point (project space). Uses view to keep crosshair at 8 view pixels.
     * @param {paper.Point} point - position in project/view space (e.g. ev.original.point)
     */
    setCrosshairPosition(point) {
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

    /**
     * Apply zoom-independent stroke and optional preview styling to a path.
     * @param {paper.Path} path
     * @param {boolean} [isPreview=false]
     */
    applyPreviewOrPathStyle(path, isPreview = false) {
        const z = this.getZoomFactor();
        path.strokeWidth = this.strokeWidthPixels / z;
        path.rescale = { strokeWidth: this.strokeWidthPixels };
        const firstPath = this.item && this.item.children.length
            ? this._getPathFromSegmentChild(this.item.children[0])
            : null;
        path.strokeColor = firstPath ? firstPath.strokeColor : new paper.Color('black');
        path.strokeCap = 'round';
        path.strokeJoin = 'round';
        if (isPreview) {
            path.dashArray = [6, 6];
            path.opacity = 0.8;
        }
    }

    /**
     * Commit a two-point segment to the current item and clear placement state.
     * @param {paper.Point} p1
     * @param {paper.Point} p2
     */
    commitRulerSegment(p1, p2) {
        if (p1.getDistance(p2) < ZERO_LENGTH_EPSILON) return;
        if (!this._ensureItemForDrawing()) return;

        const path = new paper.Path([p1, p2]);
        this.applyPreviewOrPathStyle(path, false);
        const segmentGroup = new paper.Group();
        segmentGroup.addChild(path);
        this._ensurePathLabel(segmentGroup);
        this.item.addChild(segmentGroup);

        this._clearPlacementState();
        const distance = p1.getDistance(p2);
        this._lastMeasurement = { p1, p2, distance };
        this.toolbarControl.updateMeasurement(p1, p2, distance);
        this.mode = 'modifying';
        this._crosshair.visible = false;
        if (this.toolbarControl.updateInstructions) {
            this.toolbarControl.updateInstructions('modifying');
        }
    }

    onMouseDown(ev) {
        if (this.mode === 'modifying') {
            const tol = this.getTolerance(5);
            const segHit = this.item.hitTest(ev.point, { fill: false, stroke: false, segments: true, tolerance: tol });
            if (segHit && segHit.type === 'segment') {
                this._editPath = segHit.segment.path;
                this._editSegmentIndex = this._editPath.segments.indexOf(segHit.segment);
                this.mode = 'endpoint-drag';
                return;
            }
            const strokeHit = this.item.hitTest(ev.point, { fill: false, stroke: true, segments: false, tolerance: tol });
            if (strokeHit) {
                this.mode = 'line-drag';
                return;
            }
            return;
        }
        if (this._firstPoint === null) {
            if (!this._ensureItemForDrawing()) return;
            this._firstPoint = ev.point.clone();
            this._previewPath = new paper.Path([this._firstPoint.clone(), this._firstPoint.clone()]);
            this.drawingGroup.removeChildren();
            this.drawingGroup.addChild(this._previewPath);
            this.applyPreviewOrPathStyle(this._previewPath, true);
            this._didDrag = false;
            this._drawingItem = this.item;
            this.toolbarControl.updateMeasurement(this._firstPoint, this._firstPoint, 0);
            return;
        }
        if (!this._didDrag) {
            this.commitRulerSegment(this._firstPoint, ev.point);
        }
    }

    onMouseMove(ev) {
        this.setCrosshairPosition(ev.original.point);
        if (this.mode === 'modifying' && this.item) {
            const tol = this.getTolerance(5);
            const segHit = this.item.hitTest(ev.point, { fill: false, stroke: false, segments: true, tolerance: tol });
            if (segHit) {
                this.project.overlay.addClass('rectangle-tool-resize');
                this.project.overlay.removeClass('rectangle-tool-move');
            } else {
                const strokeHit = this.item.hitTest(ev.point, { fill: false, stroke: true, segments: false, tolerance: tol });
                if (strokeHit) {
                    this.project.overlay.addClass('rectangle-tool-move');
                    this.project.overlay.removeClass('rectangle-tool-resize');
                } else {
                    this.project.overlay.removeClass('rectangle-tool-resize', 'rectangle-tool-move');
                }
            }
        }
        if (this._firstPoint !== null && this._previewPath) {
            this._previewPath.segments[1].point = ev.point;
            const d = this._firstPoint.getDistance(ev.point);
            this.toolbarControl.updateMeasurement(this._firstPoint, ev.point, d);
        } else {
            if (this._lastMeasurement.p1 && this._lastMeasurement.p2) {
                this.toolbarControl.updateMeasurement(
                    this._lastMeasurement.p1,
                    this._lastMeasurement.p2,
                    this._lastMeasurement.distance
                );
            } else {
                this.toolbarControl.updateMeasurement(null, null, null);
            }
        }
    }

    onMouseDrag(ev) {
        if (this.mode === 'endpoint-drag' && this._editPath) {
            this._editPath.segments[this._editSegmentIndex].point = ev.point.clone();
            const p1 = this._editPath.segments[0].point;
            const p2 = this._editPath.segments[1].point;
            const distance = p1.getDistance(p2);
            this._lastMeasurement = { p1, p2, distance };
            this.toolbarControl.updateMeasurement(p1, p2, distance);
            if (this._editPath.parent instanceof paper.Group) {
                this._ensurePathLabel(this._editPath.parent);
            }
            return;
        }
        if (this.mode === 'line-drag') {
            this.item.translate(ev.delta);
            return;
        }
        this._didDrag = true;
        this.setCrosshairPosition(ev.original.point);
        if (this._firstPoint !== null && this._previewPath) {
            this._previewPath.segments[1].point = ev.point;
            const d = this._firstPoint.getDistance(ev.point);
            this.toolbarControl.updateMeasurement(this._firstPoint, ev.point, d);
        }
    }

    onMouseUp(ev) {
        if (this.mode === 'endpoint-drag' || this.mode === 'line-drag') {
            this.mode = 'modifying';
            this._editPath = null;
            this._editSegmentIndex = null;
            return;
        }
        if (this._firstPoint !== null && this._didDrag) {
            this.commitRulerSegment(this._firstPoint, ev.point);
        }
        this._didDrag = false;
    }
}

export { RulerTool };

/**
 * Toolbar for RulerTool: line width (px) number input and measurement display (P1, P2, distance).
 * @extends AnnotationUIToolbarBase
 * @class
 * @memberof OSDPaperjsAnnotation.RulerTool
 */
class RulerToolbar extends AnnotationUIToolbarBase {
    constructor(rulerTool) {
        super(rulerTool);
        this.rulerTool = rulerTool;

        const i = makeFaIcon('fa-ruler');
        this.button.configure(i, 'Ruler Tool');

        const fdd = document.createElement('div');
        fdd.classList.add('dropdown', 'ruler-toolbar');
        fdd.setAttribute('data-tool', 'ruler');
        this.dropdown.appendChild(fdd);

        const label = document.createElement('label');
        label.textContent = 'Line width (px):';
        fdd.appendChild(label);

        this.widthInput = document.createElement('input');
        this.widthInput.type = 'number';
        this.widthInput.min = 1;
        this.widthInput.value = 2;
        this.widthInput.classList.add('ruler-width-input');
        fdd.appendChild(this.widthInput);
        this.widthInput.addEventListener('change', () => {
            rulerTool.setStrokeWidthPixels(this.widthInput.value);
        });

        this.instructions = document.createElement('span');
        this.instructions.className = 'ruler-instructions';
        fdd.appendChild(this.instructions);

        const measureLabel = document.createElement('div');
        measureLabel.className = 'ruler-measurement-label';
        measureLabel.textContent = 'Measurement:';
        fdd.appendChild(measureLabel);

        this.measurementBlock = document.createElement('div');
        this.measurementBlock.className = 'ruler-measurement';
        fdd.appendChild(this.measurementBlock);

        rulerTool.setStrokeWidthPixels(2);
        this.updateMeasurement(null, null, null);
        this.updateInstructions(null);
    }

    updateInstructions(mode) {
        const text = mode === 'creating' || !mode
            ? 'Click to set first point, then click or drag to complete.'
            : 'Drag endpoints to resize, drag line to move.';
        this.instructions.textContent = text;
    }

    formatNum(n) {
        if (n == null || typeof n !== 'number') return '—';
        return n.toFixed(2);
    }

    updateMeasurement(p1, p2, distance) {
        const fmt = (p) => (p ? `(${this.formatNum(p.x)}, ${this.formatNum(p.y)})` : '—');
        const p1Str = p1 != null ? fmt(p1) : '—';
        const p2Str = p2 != null ? fmt(p2) : '—';
        const distStr = distance != null ? this.formatNum(distance) : '—';
        this.measurementBlock.innerHTML = [
            `P1: ${p1Str}`,
            `P2: ${p2Str}`,
            `Distance: ${distStr}`,
        ].join('<br>');
    }

    isEnabledForMode(mode) {
        return ['new', 'LineString', 'MultiLineString'].includes(mode);
    }
}
