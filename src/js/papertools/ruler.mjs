/**
 * OpenSeadragon paperjs overlay plugin based on paper.js
 * @version 0.6.0
 *
 * Includes additional open source libraries which are subject to copyright notices
 * as indicated accompanying those segments of code.
 *
 * Original code:
 * Copyright (c) 2022-2026, Thomas Pearce
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
import { clampDecimals, normalizeRoundingMode, formatDecimal } from '../utils/measurementFormat.mjs';

const ZERO_LENGTH_EPSILON = 1e-6;
const CROSSHAIR_SIZE_PX = 8;
const RULER_LABEL_FONT_SIZE = 12;
const RULER_LABEL_GAP_PX = 4; // Gap between line and label in screen pixels (zoom-independent)
const RULER_HALO_EXTRA_PX = 2; // Extra stroke width for white halo (in screen pixels, zoom-independent)
const RULER_LABEL_STROKE_PX = 3; // Heavy white stroke for stroke-only label (background, in screen pixels, zoom-independent)
const DEFAULT_DECIMALS = 2;
const DEFAULT_ROUNDING_MODE = 'round';

// Segment group layout: exactly 3 children (halo, path, labelGroup with [strokeLabel, fillLabel])
const SEGMENT_HALO = 0;
const SEGMENT_PATH = 1;
const SEGMENT_LABEL_GROUP = 2;

/**
 * Ruler tool: two-point measurement. Extends AnnotationUITool only.
 * Creates segments with exactly two points (click-move-click or click-drag).
 * Line width is in screen pixels (zoom-independent via rescale).
 * Displays P1, P2, and distance in toolbar.
 *
 * Emits on project when a measurement's geometry or display changes (for list/UI sync):
 * - `ruler-measurement-updated` with payload `{ item, label?, distance? }` (item = measurement Group;
 *   label = display string; distance = length in project units). Fired after segment commit,
 *   after endpoint/line drag edit, and when display settings (units etc.) change.
 *
 * @extends AnnotationUITool
 * @class
 * @memberof OSDPaperjsAnnotation
 */
class RulerTool extends AnnotationUITool {
    constructor(paperScope) {
        super(paperScope);
        this.setToolbarControl(new RulerToolbar(this));
        this.registerOverlayCursorOwnedClasses('rectangle-tool-resize', 'rectangle-tool-move');

        // Config and placement state
        this.strokeWidthPixels = 2;
        this.haloExtraPixels = 2;
        this.labelFontSize = 12;
        this._firstPoint = null;
        this._previewSegmentGroup = null;
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
            this.clearOverlayCursorOwnedClasses();
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
        if (this._previewSegmentGroup && this._previewSegmentGroup.parent) {
            this._previewSegmentGroup.remove();
        }
        this._previewSegmentGroup = null;
    }

    /**
     * Ensure we have an item to draw into (create MultiLineString from itemToCreate if needed).
     * @private
     * @returns {boolean} true if this.item is available
     */
    _ensureItemForDrawing() {
        if (this.itemToCreate) {
            this.itemToCreate.initializeGeoJSONFeature('MultiLineString', 'Measurement');
            this.refreshItems();
            this._setTargetLayer();
            if (this.isActive()) {
                this.targetLayer.addChild(this.drawingGroup);
            }
        }
        return !!this.item;
    }

    /**
     * Resolve the main path from a segment child (group with path, or legacy path).
     * @private
     * @param {paper.Item} child - segment group (Group with [halo, path, labelGroup] or legacy 4-child) or legacy Path
     * @returns {paper.Path|null}
     * @description For groups: 3 or 4 children -> path at index 1.
     */
    _getPathFromSegmentChild(child) {
        if (!child) return null;
        if (child instanceof paper.Path) return child;
        if (child instanceof paper.Group && (child.children.length === 3 || child.children.length === 4)) return child.children[SEGMENT_PATH];
        return null;
    }

    /**
     * Update label content and position for a segment group (assumes 3 children: halo, path, labelGroup).
     * @private
     * @param {paper.Group} segmentGroup - group with [halo, path, labelGroup] where labelGroup has [strokeLabel, fillLabel]
     */
    _ensurePathLabel(segmentGroup) {
        if (segmentGroup.children.length !== 3) return;
        const path = segmentGroup.children[SEGMENT_PATH];
        const labelGroup = segmentGroup.children[SEGMENT_LABEL_GROUP];
        const haloPath = segmentGroup.children[SEGMENT_HALO];
        if (!path || path.segments.length < 2 || !labelGroup || labelGroup.children.length < 2) return;

        // Segment in item: delegate content and position to the item (no view listeners here)
        if (this.item && segmentGroup.parent === this.item && this.item.annotationItem && typeof this.item.annotationItem.refreshSegmentLabel === 'function') {
            this.item.annotationItem.refreshSegmentLabel(segmentGroup);
        } else {
            // Preview or non-Measurement: tool updates content and position (no listeners)
            const strokeLabel = labelGroup.children[0];
            const fillLabel = labelGroup.children[1];
            const p1 = path.segments[0].point;
            const p2 = path.segments[1].point;
            const distance = p1.getDistance(p2);
            const midpoint = p1.add(p2).divide(2);
            const formatted = this.toolbarControl.formatDistance(distance);
            const fillColor = path.strokeColor || new paper.Color('black');

            fillLabel.justification = 'center';
            fillLabel.fillColor = fillColor;
            fillLabel.strokeColor = null;
            fillLabel.content = formatted;
            fillLabel.rescale = fillLabel.rescale || {};
            fillLabel.rescale.fontSize = (z) => this.labelFontSize / z;
            delete fillLabel.rescale.strokeWidth;
            strokeLabel.justification = 'center';
            strokeLabel.strokeColor = 'white';
            strokeLabel.fillColor = null;
            strokeLabel.content = formatted;
            strokeLabel.rescale = strokeLabel.rescale || {};
            strokeLabel.rescale.fontSize = (z) => this.labelFontSize / z;
            strokeLabel.rescale.strokeWidth = (z) => RULER_LABEL_STROKE_PX / z;
            if (fillLabel.applyRescale) fillLabel.applyRescale();
            if (strokeLabel.applyRescale) strokeLabel.applyRescale();
            const labelHeight = (fillLabel.getInternalBounds && fillLabel.getInternalBounds()) ? fillLabel.getInternalBounds().height : (fillLabel.bounds ? fillLabel.bounds.height : 0);
            if (labelHeight > 0) {
                fillLabel.point = new paper.Point(0, labelHeight / 2);
                strokeLabel.point = new paper.Point(0, labelHeight / 2);
                labelGroup.pivot = new paper.Point(0, labelHeight / 2);
            }
            const placementCenter = this._computeLabelPlacementCenter(fillLabel, p1, p2, midpoint);
            labelGroup.position = placementCenter.clone();
        }

        // Sync halo geometry to path (tool responsibility whenever it touches segment groups)
        if (haloPath instanceof paper.Path && haloPath.segments.length === path.segments.length) {
            path.segments.forEach((seg, i) => {
                haloPath.segments[i].point = seg.point.clone();
            });
        }
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

        // Offset: half label height (use getInternalBounds like PointText when available) + gap (constant pixels)
        const labelBounds = (label.getInternalBounds && label.getInternalBounds()) ? label.getInternalBounds() : label.bounds;
        const labelHeight = labelBounds ? labelBounds.height : 0;
        const offset = labelHeight / 2 + gapPaper;
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
     * Ensure every segment is a 3-child group (halo, path, labelGroup). Replace bare Paths with a new segment group; refresh labels on Groups.
     * @private
     */
    _ensureItemLabels() {
        if (!this.item || !this.item.children.length) return;
        const toProcess = this.item.children.slice();
        toProcess.forEach((child, index) => {
            if (child instanceof paper.Path) {
                const path = child;
                const p1 = path.segments[0] && path.segments[0].point;
                const p2 = path.segments[1] && path.segments[1].point;
                if (!p1 || !p2) return;
                const group = this.buildSegmentGroup(p1, p2, { preview: false });
                this.item.removeChild(path);
                this.item.insertChild(index, group);
                this._ensurePathLabel(group);
            } else if (child instanceof paper.Group && child.children.length === 3) {
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
        if (this.mode !== 'modifying') this.clearOverlayCursorOwnedClasses();
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

    /**
     * Write current tool and toolbar settings to this.item.data.ruler when item is a Measurement (for save/load).
     * @private
     */
    _writeRulerDataToItem() {
        if (!this.item || !this.item.annotationItem) return;
        const typeInfo = this.item.annotationItem.getGeoJSONType?.();
        if (typeInfo?.subtype !== 'Measurement') return;
        const tc = this.toolbarControl;
        this.item.data.ruler = {
            units: tc && tc.labelUnit != null ? tc.labelUnit : 'px',
            unitsPerPixel: tc && tc.unitsPerPixel != null ? tc.unitsPerPixel : 1,
            decimals: tc && tc.decimals != null ? tc.decimals : DEFAULT_DECIMALS,
            roundingMode: tc && tc.roundingMode != null ? tc.roundingMode : DEFAULT_ROUNDING_MODE,
            strokeWidthPixels: this.strokeWidthPixels,
            haloExtraPixels: this.haloExtraPixels,
            labelFontSize: this.labelFontSize,
        };
    }

    setStrokeWidthPixels(n) {
        this.strokeWidthPixels = Math.max(1, parseInt(n, 10) || 1);
        this._refreshItemSegments();
        this._writeRulerDataToItem();
        if (this.item) this.emitItemEvent('item-updated', { item: this.item, tool: this, reason: 'ruler-settings' });
    }

    setHaloExtraPixels(n) {
        this.haloExtraPixels = Math.max(0, parseInt(n, 10) || 0);
        this._refreshItemSegments();
        this._writeRulerDataToItem();
        if (this.item) this.emitItemEvent('item-updated', { item: this.item, tool: this, reason: 'ruler-settings' });
    }

    setLabelFontSize(n) {
        const v = parseInt(n, 10);
        this.labelFontSize = (v >= 6 && v <= 72) ? v : 12;
        this._refreshItemSegments();
        this._writeRulerDataToItem();
        if (this.item) this.emitItemEvent('item-updated', { item: this.item, tool: this, reason: 'ruler-settings' });
    }

    setDecimals(n) {
        const v = clampDecimals(parseInt(n, 10), DEFAULT_DECIMALS);
        this.toolbarControl.decimals = v;
        this.toolbarControl.decimalsInput.value = String(v);
        this.toolbarControl.updateMeasurement(this._lastMeasurement?.p1 ?? null, this._lastMeasurement?.p2 ?? null, this._lastMeasurement?.distance ?? null);
        this.refreshSegmentLabels();
        this._writeRulerDataToItem();
    }

    setRoundingMode(mode) {
        const m = normalizeRoundingMode(mode, DEFAULT_ROUNDING_MODE);
        this.toolbarControl.roundingMode = m;
        this.toolbarControl.roundingModeInput.value = m;
        this.toolbarControl.updateMeasurement(this._lastMeasurement?.p1 ?? null, this._lastMeasurement?.p2 ?? null, this._lastMeasurement?.distance ?? null);
        this.refreshSegmentLabels();
        this._writeRulerDataToItem();
    }

    /**
     * Re-apply halo style, path style, and labels for all segments in this.item.
     * @private
     */
    _refreshItemSegments() {
        if (!this.item || !this.item.children.length) return;
        this.item.children.forEach((child) => {
            if (child instanceof paper.Group && child.children.length === 3) {
                const haloPath = child.children[SEGMENT_HALO];
                const path = child.children[SEGMENT_PATH];
                if (haloPath instanceof paper.Path) this.applyHaloPathStyle(haloPath);
                if (path instanceof paper.Path) this.applyPreviewOrPathStyle(path, false);
                this._ensurePathLabel(child);
            }
        });
    }

    /**
     * Emit ruler-measurement-updated on the project so listeners (e.g. measurements list) can update in real time.
     * @private
     * @param {paper.Item} [item=this.item] - The measurement Group to report.
     */
    _emitMeasurementUpdated(item) {
        item = item || this.item;
        if (!item || !item.project) return;
        const path = item.children?.length ? this._getPathFromSegmentChild(item.children[0]) : null;
        const distance = this._lastMeasurement?.distance ?? (path && path.segments?.length >= 2 ? path.segments[0].point.getDistance(path.segments[1].point) : undefined);
        item.project.emit('ruler-measurement-updated', {
            item,
            label: item.displayName || 'Measurement',
            distance,
        });
    }

    /**
     * Refresh on-canvas label content/position for all segments (e.g. when units or unitsPerPixel change).
     */
    refreshSegmentLabels() {
        if (!this.item || !this.item.children.length) return;
        this._writeRulerDataToItem();
        this.item.children.forEach((child) => {
            if (child instanceof paper.Group && child.children.length === 3) {
                this._ensurePathLabel(child);
            }
        });
        this._emitMeasurementUpdated();
        if (this.item) this.emitItemEvent('item-updated', { item: this.item, tool: this, reason: 'ruler-settings' });
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
     * Apply white halo style to a path (for contrast border behind main path).
     * @private
     * @param {paper.Path} haloPath - path to style as white halo
     */
    applyHaloPathStyle(haloPath) {
        const z = this.getZoomFactor();
        const haloWidthPixels = this.strokeWidthPixels + this.haloExtraPixels;
        haloPath.strokeWidth = haloWidthPixels / z;
        haloPath.rescale = { strokeWidth: haloWidthPixels };
        haloPath.strokeColor = 'white';
        haloPath.strokeCap = 'round';
        haloPath.strokeJoin = 'round';
    }

    /**
     * Build a segment group with exactly 3 children: halo, path, labelGroup ([strokeLabel, fillLabel]).
     * Labels are in a group that counter-rotates with view (upright like PointText).
     * Caller must add the group to the project before calling _ensurePathLabel for correct label placement.
     * @private
     * @param {paper.Point} p1 - segment start
     * @param {paper.Point} p2 - segment end
     * @param {{ preview?: boolean }} [options] - preview: true for dashed path
     * @returns {paper.Group}
     */
    buildSegmentGroup(p1, p2, options = {}) {
        const isPreview = !!options.preview;
        const haloPath = new paper.Path([p1.clone(), p2.clone()]);
        this.applyHaloPathStyle(haloPath);
        const path = new paper.Path([p1.clone(), p2.clone()]);
        this.applyPreviewOrPathStyle(path, isPreview);
        const distance = p1.getDistance(p2);
        const formatted = this.toolbarControl.formatDistance(distance);
        const fillColor = path.strokeColor || new paper.Color('black');
        const midpoint = p1.add(p2).divide(2);

        const strokeLabel = new paper.PointText({
            point: new paper.Point(0, 0),
            content: formatted,
            fontSize: this.labelFontSize,
            fillColor: null,
            strokeColor: 'white',
            justification: 'center',
        });
        strokeLabel.rescale = {
            fontSize: (z) => this.labelFontSize / z,
            strokeWidth: (z) => RULER_LABEL_STROKE_PX / z,
        };
        const fillLabel = new paper.PointText({
            point: new paper.Point(0, 0),
            content: formatted,
            fontSize: this.labelFontSize,
            fillColor,
            justification: 'center',
        });
        fillLabel.rescale = { fontSize: (z) => this.labelFontSize / z };

        const labelGroup = new paper.Group();
        labelGroup.pivot = new paper.Point(0, 0);
        labelGroup.applyMatrix = true;
        labelGroup.position = midpoint.clone();
        labelGroup.addChild(strokeLabel);
        labelGroup.addChild(fillLabel);

        const group = new paper.Group();
        group.addChild(haloPath);
        group.addChild(path);
        group.addChild(labelGroup);
        return group;
    }

    /**
     * Commit a two-point segment to the current item and clear placement state.
     * @param {paper.Point} p1
     * @param {paper.Point} p2
     */
    commitRulerSegment(p1, p2) {
        if (p1.getDistance(p2) < ZERO_LENGTH_EPSILON) return;
        if (!this._ensureItemForDrawing()) return;

        const hadSegmentsBefore = this.item.children.length > 0;
        const segmentGroup = this.buildSegmentGroup(p1, p2, { preview: false });
        this.item.addChild(segmentGroup);
        this._writeRulerDataToItem();
        this._ensurePathLabel(segmentGroup);

        // Only the ruler line (path) gets selection style; not the segment group or labels
        const parentSelected = this.item.selected;
        const segPath = segmentGroup.children.length > SEGMENT_PATH ? segmentGroup.children[SEGMENT_PATH] : null;
        if (segPath) segPath.selected = parentSelected;

        this._clearPlacementState();
        const distance = p1.getDistance(p2);
        this._lastMeasurement = { p1, p2, distance };
        this.toolbarControl.updateMeasurement(p1, p2, distance);
        this.mode = 'modifying';
        this._crosshair.visible = false;
        if (this.toolbarControl.updateInstructions) {
            this.toolbarControl.updateInstructions('modifying');
        }
        this._emitMeasurementUpdated();
        if (!hadSegmentsBefore) this.emitItemEvent('item-created', { item: this.item, tool: this });
        else this.emitItemEvent('item-updated', { item: this.item, tool: this, subpathAdded: true, subpath: segmentGroup });
    }

    onMouseDown(ev) {
        if (this.mode === 'modifying') {
            const tol = this.getTolerance(5);
            const segHit = this.item.hitTest(ev.point, { fill: false, stroke: false, segments: true, tolerance: tol });
            if (segHit && segHit.type === 'segment') {
                const hitPath = segHit.segment.path;
                this._editPath = (hitPath.parent instanceof paper.Group ? this._getPathFromSegmentChild(hitPath.parent) : null) || hitPath;
                this._editSegmentIndex = this._editPath.segments.indexOf(segHit.segment);
                this.mode = 'endpoint-drag';
                return;
            }
            const strokeHit = this.item.hitTest(ev.point, { fill: false, stroke: true, segments: false, tolerance: tol });
            if (strokeHit) {
                const hitItem = strokeHit.item;
                this._editPath = (hitItem.parent instanceof paper.Group ? this._getPathFromSegmentChild(hitItem.parent) : null) || hitItem;
                this.mode = 'line-drag';
                return;
            }
            return;
        }
        if (this._firstPoint === null) {
            if (!this._ensureItemForDrawing()) return;
            this._firstPoint = ev.point.clone();
            this._previewSegmentGroup = this.buildSegmentGroup(this._firstPoint.clone(), this._firstPoint.clone(), { preview: true });
            this.drawingGroup.removeChildren();
            this.drawingGroup.addChild(this._previewSegmentGroup);
            const previewPath = this._previewSegmentGroup.children.length > SEGMENT_PATH ? this._previewSegmentGroup.children[SEGMENT_PATH] : null;
            if (previewPath) previewPath.selected = true;
            this._didDrag = false;
            this._drawingItem = this.item;
            this.toolbarControl.updateMeasurement(this._firstPoint, this._firstPoint, 0);
            return;
        }
        if (!this._didDrag) {
            this.commitRulerSegment(this._firstPoint, ev.point);
            this._clearPlacementState();
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
        if (this._firstPoint !== null && this._previewSegmentGroup) {
            const path = this._previewSegmentGroup.children[SEGMENT_PATH];
            const haloPath = this._previewSegmentGroup.children[SEGMENT_HALO];
            if (path) path.segments[1].point = ev.point.clone();
            if (haloPath && haloPath.segments.length === 2) haloPath.segments[1].point = ev.point.clone();
            this._ensurePathLabel(this._previewSegmentGroup);
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
            if (this._editPath.parent instanceof paper.Group && (this._editPath.parent.children.length === 3 || this._editPath.parent.children.length === 4)) {
                const haloPath = this._editPath.parent.children[SEGMENT_HALO];
                if (haloPath instanceof paper.Path && haloPath.segments.length === this._editPath.segments.length) {
                    haloPath.segments[this._editSegmentIndex].point = ev.point.clone();
                }
            }
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
        if (this._firstPoint !== null && this._previewSegmentGroup) {
            const path = this._previewSegmentGroup.children[SEGMENT_PATH];
            const haloPath = this._previewSegmentGroup.children[SEGMENT_HALO];
            if (path) path.segments[1].point = ev.point.clone();
            if (haloPath && haloPath.segments.length === 2) haloPath.segments[1].point = ev.point.clone();
            this._ensurePathLabel(this._previewSegmentGroup);
            const d = this._firstPoint.getDistance(ev.point);
            this.toolbarControl.updateMeasurement(this._firstPoint, ev.point, d);
        }
    }

    onMouseUp(ev) {
        if (this.mode === 'endpoint-drag' || this.mode === 'line-drag') {
            this.mode = 'modifying';
            this._editPath = null;
            this._editSegmentIndex = null;
            this._emitMeasurementUpdated();
            if (this.item) this.emitItemEvent('item-updated', { item: this.item, tool: this });
            return;
        }
        if (this._firstPoint !== null && this._didDrag) {
            this.commitRulerSegment(this._firstPoint, ev.point);
            this._clearPlacementState();
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
        this.labelUnit = 'px';
        this.unitsPerPixel = 1;
        this.decimals = DEFAULT_DECIMALS;
        this.roundingMode = DEFAULT_ROUNDING_MODE;

        const i = makeFaIcon('fa-ruler');
        this.button.configure(i, 'Ruler Tool');

        const fdd = document.createElement('div');
        fdd.classList.add('dropdown', 'ruler-toolbar');
        fdd.setAttribute('data-tool', 'ruler');
        this.dropdown.appendChild(fdd);

        // Default row: "Length: _____" + expand/collapse button (single line when collapsed)
        const lengthRow = document.createElement('div');
        lengthRow.classList.add('ruler-length-row');
        fdd.appendChild(lengthRow);

        const lengthLabel = document.createElement('span');
        lengthLabel.textContent = 'Length: ';
        lengthRow.appendChild(lengthLabel);
        this.lengthEl = document.createElement('span');
        this.lengthEl.className = 'ruler-length-value';
        lengthRow.appendChild(this.lengthEl);

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.classList.add('ruler-details-toggle');
        toggleBtn.setAttribute('aria-label', 'Toggle details');
        this._detailsExpanded = false;
        this._chevronDown = makeFaIcon('fa-caret-down');
        this._chevronUp = makeFaIcon('fa-caret-up');
        toggleBtn.appendChild(this._chevronDown);
        lengthRow.appendChild(toggleBtn);

        toggleBtn.addEventListener('click', () => {
            this._detailsExpanded = !this._detailsExpanded;
            this.detailsPanel.hidden = !this._detailsExpanded;
            toggleBtn.replaceChildren(this._detailsExpanded ? this._chevronUp : this._chevronDown);
            const tk = rulerTool?.project?.paperScope?.annotationToolkit;
            if (tk && tk._emitIntegrationEvent) tk._emitIntegrationEvent('ruler-details-open-changed', { open: this._detailsExpanded }, { tool: rulerTool });
        });

        // Details panel (collapsible); instructions live here so collapsed = one line only
        this.detailsPanel = document.createElement('div');
        this.detailsPanel.classList.add('ruler-details-panel');
        this.detailsPanel.hidden = true;
        fdd.appendChild(this.detailsPanel);

        const detailsContent = document.createElement('div');
        detailsContent.classList.add('ruler-details-content');
        this.detailsPanel.appendChild(detailsContent);

        this.instructions = document.createElement('span');
        this.instructions.className = 'ruler-instructions';
        detailsContent.appendChild(this.instructions);

        this.p1El = document.createElement('div');
        this.p1El.className = 'ruler-detail-p1';
        this.p1El.textContent = 'P1: —';
        detailsContent.appendChild(this.p1El);
        this.p2El = document.createElement('div');
        this.p2El.className = 'ruler-detail-p2';
        this.p2El.textContent = 'P2: —';
        detailsContent.appendChild(this.p2El);

        const addRow = (labelText, inputEl, inputId) => {
            const row = document.createElement('div');
            row.classList.add('ruler-detail-row');
            const lab = document.createElement('label');
            lab.htmlFor = inputId;
            lab.textContent = labelText;
            row.appendChild(lab);
            inputEl.id = inputId;
            row.appendChild(inputEl);
            detailsContent.appendChild(row);
        };

        this.widthInput = document.createElement('input');
        this.widthInput.type = 'number';
        this.widthInput.min = 1;
        this.widthInput.value = 2;
        this.widthInput.classList.add('ruler-width-input');
        this.widthInput.addEventListener('change', () => {
            rulerTool.setStrokeWidthPixels(this.widthInput.value);
            const tk = rulerTool?.project?.paperScope?.annotationToolkit;
            if (tk && tk._emitIntegrationEvent) tk._emitIntegrationEvent('ruler-setting-changed', { key: 'widthPixels', value: Number(this.widthInput.value) }, { tool: rulerTool });
        });
        addRow('Line width (px):', this.widthInput, 'ruler-line-width');

        this.haloInput = document.createElement('input');
        this.haloInput.type = 'number';
        this.haloInput.min = 0;
        this.haloInput.value = 2;
        this.haloInput.classList.add('ruler-halo-input');
        this.haloInput.addEventListener('change', () => {
            rulerTool.setHaloExtraPixels(this.haloInput.value);
            const tk = rulerTool?.project?.paperScope?.annotationToolkit;
            if (tk && tk._emitIntegrationEvent) tk._emitIntegrationEvent('ruler-setting-changed', { key: 'haloPixels', value: Number(this.haloInput.value) }, { tool: rulerTool });
        });
        addRow('Padding / Halo (px):', this.haloInput, 'ruler-halo');

        this.fontSizeInput = document.createElement('input');
        this.fontSizeInput.type = 'number';
        this.fontSizeInput.min = 6;
        this.fontSizeInput.max = 72;
        this.fontSizeInput.value = 12;
        this.fontSizeInput.classList.add('ruler-font-size-input');
        this.fontSizeInput.addEventListener('change', () => {
            rulerTool.setLabelFontSize(this.fontSizeInput.value);
            const tk = rulerTool?.project?.paperScope?.annotationToolkit;
            if (tk && tk._emitIntegrationEvent) tk._emitIntegrationEvent('ruler-setting-changed', { key: 'fontSize', value: Number(this.fontSizeInput.value) }, { tool: rulerTool });
        });
        addRow('Font size:', this.fontSizeInput, 'ruler-font-size');

        this.unitsInput = document.createElement('input');
        this.unitsInput.type = 'text';
        this.unitsInput.value = 'px';
        this.unitsInput.classList.add('ruler-units-input');
        this.unitsInput.addEventListener('change', () => {
            this.labelUnit = (this.unitsInput.value || 'px').trim();
            this.updateMeasurement(rulerTool._lastMeasurement?.p1 ?? null, rulerTool._lastMeasurement?.p2 ?? null, rulerTool._lastMeasurement?.distance ?? null);
            rulerTool.refreshSegmentLabels();
            const tk = rulerTool?.project?.paperScope?.annotationToolkit;
            if (tk && tk._emitIntegrationEvent) tk._emitIntegrationEvent('ruler-setting-changed', { key: 'units', value: this.labelUnit }, { tool: rulerTool });
        });
        addRow('Units:', this.unitsInput, 'ruler-units');

        this.unitsPerPixelInput = document.createElement('input');
        this.unitsPerPixelInput.type = 'number';
        this.unitsPerPixelInput.min = 0.0001;
        this.unitsPerPixelInput.step = 'any';
        this.unitsPerPixelInput.value = 1;
        this.unitsPerPixelInput.classList.add('ruler-units-per-pixel-input');
        this.unitsPerPixelInput.addEventListener('change', () => {
            const v = parseFloat(this.unitsPerPixelInput.value);
            this.unitsPerPixel = (v > 0 && Number.isFinite(v)) ? v : 1;
            this.updateMeasurement(rulerTool._lastMeasurement?.p1 ?? null, rulerTool._lastMeasurement?.p2 ?? null, rulerTool._lastMeasurement?.distance ?? null);
            rulerTool.refreshSegmentLabels();
            const tk = rulerTool?.project?.paperScope?.annotationToolkit;
            if (tk && tk._emitIntegrationEvent) tk._emitIntegrationEvent('ruler-setting-changed', { key: 'unitsPerPixel', value: this.unitsPerPixel }, { tool: rulerTool });
        });
        addRow('Units per pixel:', this.unitsPerPixelInput, 'ruler-units-per-pixel');

        this.decimalsInput = document.createElement('input');
        this.decimalsInput.type = 'number';
        this.decimalsInput.min = 0;
        this.decimalsInput.step = 1;
        this.decimalsInput.value = DEFAULT_DECIMALS;
        this.decimalsInput.classList.add('ruler-decimals-input');
        this.decimalsInput.addEventListener('change', () => {
            rulerTool.setDecimals(this.decimalsInput.value);
            const tk = rulerTool?.project?.paperScope?.annotationToolkit;
            if (tk && tk._emitIntegrationEvent) tk._emitIntegrationEvent('ruler-setting-changed', { key: 'decimals', value: Number(this.decimalsInput.value) }, { tool: rulerTool });
        });
        addRow('Decimals:', this.decimalsInput, 'ruler-decimals');

        this.roundingModeInput = document.createElement('select');
        this.roundingModeInput.classList.add('ruler-rounding-mode-input');
        const roundOption = document.createElement('option');
        roundOption.value = 'round';
        roundOption.textContent = 'round';
        const truncateOption = document.createElement('option');
        truncateOption.value = 'truncate';
        truncateOption.textContent = 'truncate';
        this.roundingModeInput.append(roundOption, truncateOption);
        this.roundingModeInput.value = DEFAULT_ROUNDING_MODE;
        this.roundingModeInput.addEventListener('change', () => {
            rulerTool.setRoundingMode(this.roundingModeInput.value);
            const tk = rulerTool?.project?.paperScope?.annotationToolkit;
            if (tk && tk._emitIntegrationEvent) tk._emitIntegrationEvent('ruler-setting-changed', { key: 'roundingMode', value: this.roundingModeInput.value }, { tool: rulerTool });
        });
        addRow('Rounding mode:', this.roundingModeInput, 'ruler-rounding-mode');

        rulerTool.setStrokeWidthPixels(2);
        rulerTool.setHaloExtraPixels(2);
        rulerTool.setLabelFontSize(12);
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
        return formatDecimal(n, this.decimals, this.roundingMode);
    }

    formatDistance(distancePaper) {
        if (distancePaper == null || typeof distancePaper !== 'number') return '—';
        const value = distancePaper * this.unitsPerPixel;
        return this.formatNum(value) + ' ' + this.labelUnit;
    }

    updateMeasurement(p1, p2, distance) {
        this.lengthEl.textContent = distance != null ? this.formatDistance(distance) : '—';
        const fmt = (p) => (p ? `(${this.formatNum(p.x)}, ${this.formatNum(p.y)})` : '—');
        this.p1El.textContent = 'P1: ' + (p1 != null ? fmt(p1) : '—');
        this.p2El.textContent = 'P2: ' + (p2 != null ? fmt(p2) : '—');
    }

    isEnabledForMode(mode) {
        return ['new', 'LineString', 'MultiLineString', 'MultiLineString:Measurement'].includes(mode);
    }
}
