/**
 * OpenSeadragon paperjs overlay plugin based on paper.js
 * @version 0.4.15
 *
 * Copyright (c) 2022-2026, Thomas Pearce
 * All rights reserved.
 */

import { MultiLinestring } from './multilinestring.mjs';
import { paper } from '../paperjs.mjs';

// Segment group layout: exactly 3 children (must match ruler.mjs): halo, path, labelGroup ([strokeLabel, fillLabel])
const SEGMENT_HALO = 0;
const SEGMENT_PATH = 1;
const SEGMENT_LABEL_GROUP = 2;

const RULER_LABEL_STROKE_PX = 3;
const RULER_LABEL_GAP_PX = 4; // Gap between line and label in screen pixels (must match ruler.mjs)
const DEFAULT_STROKE_WIDTH_PX = 2;
const DEFAULT_HALO_EXTRA_PX = 2;
const DEFAULT_LABEL_FONT_SIZE = 12;

/**
 * Compute placement center for label offset above segment (constant pixel gap, zoom-aware).
 * Same math as ruler tool's _computeLabelPlacementCenter; used only by the item.
 * @param {paper.PointText} label - label with bounds set (after applyRescale)
 * @param {paper.Point} p1 - segment start point
 * @param {paper.Point} p2 - segment end point
 * @param {paper.Point} midpoint - segment midpoint
 * @param {number} gapPixels - gap in screen pixels (e.g. RULER_LABEL_GAP_PX)
 * @returns {paper.Point} placement center (midpoint if segment too short, otherwise offset above)
 */
function computeLabelPlacementCenter(label, p1, p2, midpoint, gapPixels) {
    const segmentDir = p2.subtract(p1);
    const segmentLength = segmentDir.length;
    if (segmentLength < 1e-6) return midpoint;

    const normalizedDir = segmentDir.normalize();
    const normal = new paper.Point(normalizedDir.y, -normalizedDir.x);
    const zoomFactor = label.view.scaling.x * label.layer.scaling.x;
    const gapPaper = gapPixels / zoomFactor;
    const labelBounds = (label.getInternalBounds && label.getInternalBounds()) ? label.getInternalBounds() : label.bounds;
    const labelHeight = labelBounds ? labelBounds.height : 0;
    const offset = labelHeight / 2 + gapPaper;
    return midpoint.add(normal.multiply(offset));
}

/**
 * Build one 3-child segment group from a path and saved measurement properties.
 * Label group counter-rotates with view (upright like PointText). Used when loading from GeoJSON.
 * @param {paper.Path} path - existing path (two segments)
 * @param {paper.Group} parentGroup - parent that will receive the segment (must be in project so labelGroup.view exists)
 * @param {Object} props - geometry.properties (lengths, units, strokeWidthPixels, haloExtraPixels, labelFontSize, etc.)
 * @param {number} index - segment index
 * @returns {paper.Group}
 */
function buildSegmentGroupFromPath(path, parentGroup, props, index) {
    const strokeWidthPixels = props.strokeWidthPixels != null ? props.strokeWidthPixels : DEFAULT_STROKE_WIDTH_PX;
    const haloExtraPixels = props.haloExtraPixels != null ? props.haloExtraPixels : DEFAULT_HALO_EXTRA_PX;
    const labelFontSize = props.labelFontSize != null ? props.labelFontSize : DEFAULT_LABEL_FONT_SIZE;
    const units = props.units != null ? props.units : 'px';
    const lengths = props.lengths || [];
    const lengthDisplay = lengths[index] != null
        ? (typeof lengths[index] === 'number' ? lengths[index].toFixed(2) : String(lengths[index])) + ' ' + units
        : '—';

    const p1 = path.segments[0].point.clone();
    const p2 = path.segments[1].point.clone();
    const midpoint = p1.add(p2).divide(2);
    const fillColor = path.strokeColor || new paper.Color('black');

    const haloPath = new paper.Path([p1.clone(), p2.clone()]);
    haloPath.strokeColor = 'white';
    haloPath.strokeCap = 'round';
    haloPath.strokeJoin = 'round';
    const haloWidthPixels = strokeWidthPixels + haloExtraPixels;
    haloPath.rescale = { strokeWidth: haloWidthPixels };

    path.strokeCap = 'round';
    path.strokeJoin = 'round';
    path.rescale = path.rescale || {};
    path.rescale.strokeWidth = strokeWidthPixels;

    const strokeLabel = new paper.PointText({
        point: new paper.Point(0, 0),
        content: lengthDisplay,
        fontSize: labelFontSize,
        fillColor: null,
        strokeColor: 'white',
        justification: 'center',
    });
    strokeLabel.rescale = {
        fontSize: (z) => labelFontSize / z,
        strokeWidth: (z) => RULER_LABEL_STROKE_PX / z,
    };

    const fillLabel = new paper.PointText({
        point: new paper.Point(0, 0),
        content: lengthDisplay,
        fontSize: labelFontSize,
        fillColor,
        justification: 'center',
    });
    fillLabel.rescale = { fontSize: (z) => labelFontSize / z };

    const labelGroup = new paper.Group();
    labelGroup.pivot = new paper.Point(0, 0);
    labelGroup.applyMatrix = true;
    labelGroup.addChild(strokeLabel);
    labelGroup.addChild(fillLabel);

    const group = new paper.Group();
    group.addChild(haloPath);
    group.addChild(path);
    group.addChild(labelGroup);

    parentGroup.addChild(group);
    if (fillLabel.applyRescale) fillLabel.applyRescale();
    if (strokeLabel.applyRescale) strokeLabel.applyRescale();
    const labelHeight = (fillLabel.getInternalBounds && fillLabel.getInternalBounds()) ? fillLabel.getInternalBounds().height : (fillLabel.bounds ? fillLabel.bounds.height : 0);
    if (labelHeight > 0) {
        fillLabel.point = new paper.Point(0, labelHeight / 2);
        strokeLabel.point = new paper.Point(0, labelHeight / 2);
        labelGroup.pivot = new paper.Point(0, labelHeight / 2);
    }
    // Position and upright: same pass as PointText (group is in project after addChild)
    if (labelGroup.view) {
        labelGroup.position = computeLabelPlacementCenter(fillLabel, p1, p2, midpoint, RULER_LABEL_GAP_PX).clone();
        function handleFlip() {
            const angle = labelGroup.view.getFlipped() ? labelGroup.view.getRotation() : 180 - labelGroup.view.getRotation();
            labelGroup.rotate(-angle);
            labelGroup.scale(-1, 1);
            labelGroup.rotate(angle);
        }
        if (labelGroup.view.getFlipped()) {
            handleFlip();
        }
        const offsetAngle = labelGroup.view.getFlipped() ? 180 - labelGroup.view.getRotation() : -labelGroup.view.getRotation();
        labelGroup.rotate(offsetAngle);
        labelGroup.view.on('rotate', (ev) => {
            const angle = -ev.rotatedBy;
            labelGroup.rotate(angle);
        });
        labelGroup.view.on('flip', () => {
            handleFlip();
        });
    }
    return group;
}

/**
 * Represents a ruler/measurement annotation: MultiLineString with subtype 'Measurement',
 * storing units, measured lengths, and display settings in geometry.properties.
 * @class
 * @extends MultiLinestring
 */
class RulerMeasurement extends MultiLinestring {
    /**
     * @param {Object} geoJSON - GeoJSON feature with geometry.type === 'MultiLineString', geometry.properties.subtype === 'Measurement'
     */
    constructor(geoJSON) {
        super(geoJSON);

        const geom = geoJSON.geometry;
        const props = geom.properties || {};
        const grp = this.paperItem;

        if (grp.children.length === 0) {
            grp.data.ruler = {
                units: props.units != null ? props.units : 'px',
                unitsPerPixel: props.unitsPerPixel != null ? props.unitsPerPixel : 1,
                strokeWidthPixels: props.strokeWidthPixels != null ? props.strokeWidthPixels : DEFAULT_STROKE_WIDTH_PX,
                haloExtraPixels: props.haloExtraPixels != null ? props.haloExtraPixels : DEFAULT_HALO_EXTRA_PX,
                labelFontSize: props.labelFontSize != null ? props.labelFontSize : DEFAULT_LABEL_FONT_SIZE,
            };
        } else {
            const children = grp.children.slice();
            grp.removeChildren();
            for (let i = 0; i < children.length; i++) {
                const path = children[i];
                buildSegmentGroupFromPath(path, grp, props, i);
            }

            grp.data.ruler = {
                units: props.units != null ? props.units : 'px',
                unitsPerPixel: props.unitsPerPixel != null ? props.unitsPerPixel : 1,
                strokeWidthPixels: props.strokeWidthPixels != null ? props.strokeWidthPixels : DEFAULT_STROKE_WIDTH_PX,
                haloExtraPixels: props.haloExtraPixels != null ? props.haloExtraPixels : DEFAULT_HALO_EXTRA_PX,
                labelFontSize: props.labelFontSize != null ? props.labelFontSize : DEFAULT_LABEL_FONT_SIZE,
            };
        }

        // Reposition labels when zoom changes so the screen-pixel gap stays constant.
        const view = this.paperItem.project && this.paperItem.project.view;
        if (view) {
            this._zoomChangedHandler = () => this.refreshSegmentLabels();
            view.on('zoom-changed', this._zoomChangedHandler);
            this.paperItem.on('removed', () => view.off('zoom-changed', this._zoomChangedHandler));
        }
    }

    static supportsGeoJSONType(type, subtype = null) {
        return type != null && type.toLowerCase() === 'multilinestring' &&
            subtype != null && subtype.toLowerCase() === 'measurement';
    }

    getGeoJSONType() {
        return {
            type: 'MultiLineString',
            subtype: 'Measurement',
        };
    }

    /**
     * Update label content and position for one segment group (content from path length + item.data.ruler).
     * Used by the ruler tool when refreshing a single segment (e.g. after drag) or all segments.
     * @param {paper.Group} segmentGroup - group with [halo, path, labelGroup] where labelGroup has [strokeLabel, fillLabel]
     */
    refreshSegmentLabel(segmentGroup) {
        if (!segmentGroup || segmentGroup.children.length !== 3) return;
        const path = segmentGroup.children[SEGMENT_PATH];
        const labelGroup = segmentGroup.children[SEGMENT_LABEL_GROUP];
        if (!path || path.segments.length < 2 || !labelGroup || labelGroup.children.length < 2) return;
        const strokeLabel = labelGroup.children[0];
        const fillLabel = labelGroup.children[1];
        const p1 = path.segments[0].point;
        const p2 = path.segments[1].point;
        const distance = p1.getDistance(p2);
        const midpoint = p1.add(p2).divide(2);
        const ruler = this.paperItem.data.ruler || {};
        const unitsPerPixel = ruler.unitsPerPixel != null ? ruler.unitsPerPixel : 1;
        const units = ruler.units != null ? ruler.units : 'px';
        const labelFontSize = ruler.labelFontSize != null ? ruler.labelFontSize : DEFAULT_LABEL_FONT_SIZE;
        const lengthDisplay = (distance * unitsPerPixel).toFixed(2) + ' ' + units;

        fillLabel.justification = 'center';
        fillLabel.fillColor = path.strokeColor || new paper.Color('black');
        fillLabel.strokeColor = null;
        fillLabel.content = lengthDisplay;
        fillLabel.rescale = fillLabel.rescale || {};
        fillLabel.rescale.fontSize = (z) => labelFontSize / z;
        delete fillLabel.rescale.strokeWidth;
        strokeLabel.justification = 'center';
        strokeLabel.strokeColor = 'white';
        strokeLabel.fillColor = null;
        strokeLabel.content = lengthDisplay;
        strokeLabel.rescale = strokeLabel.rescale || {};
        strokeLabel.rescale.fontSize = (z) => labelFontSize / z;
        strokeLabel.rescale.strokeWidth = (z) => RULER_LABEL_STROKE_PX / z;
        if (fillLabel.applyRescale) fillLabel.applyRescale();
        if (strokeLabel.applyRescale) strokeLabel.applyRescale();

        const labelHeight = (fillLabel.getInternalBounds && fillLabel.getInternalBounds()) ? fillLabel.getInternalBounds().height : (fillLabel.bounds ? fillLabel.bounds.height : 0);
        if (labelHeight > 0) {
            fillLabel.point = new paper.Point(0, labelHeight / 2);
            strokeLabel.point = new paper.Point(0, labelHeight / 2);
            labelGroup.pivot = new paper.Point(0, labelHeight / 2);
        }
        if (fillLabel.view) {
            labelGroup.position = computeLabelPlacementCenter(fillLabel, p1, p2, midpoint, RULER_LABEL_GAP_PX).clone();
        }
    }

    /**
     * Update label content and position for all segment groups. Used by the ruler tool when units/settings change.
     */
    refreshSegmentLabels() {
        const item = this.paperItem;
        if (!item || !item.layer || !item.children.length) return;
        item.children.forEach((child) => {
            if (child instanceof paper.Group && child.children.length === 3) {
                this.refreshSegmentLabel(child);
            }
        });
    }

    /**
     * Return geometry.properties (no subtype; base toGeoJSONGeometry adds it from getGeoJSONType).
     */
    getProperties() {
        const item = this.paperItem;
        const base = super.getProperties();
        const ruler = item.data.ruler || {};
        const unitsPerPixel = ruler.unitsPerPixel != null ? ruler.unitsPerPixel : 1;
        const units = ruler.units != null ? ruler.units : 'px';

        const lengths = [];
        let total = 0;
        for (let i = 0; i < item.children.length; i++) {
            const path = this._getPathFromChild(item.children[i]);
            if (path.segments.length >= 2) {
                const d = path.segments[0].point.getDistance(path.segments[1].point);
                const lengthDisplay = d * unitsPerPixel;
                lengths.push(lengthDisplay);
                total += lengthDisplay;
            } else {
                lengths.push(0);
            }
        }

        return {
            ...base,
            lengths,
            length: total,
            units,
            unitsPerPixel,
            strokeWidthPixels: ruler.strokeWidthPixels != null ? ruler.strokeWidthPixels : DEFAULT_STROKE_WIDTH_PX,
            haloExtraPixels: ruler.haloExtraPixels != null ? ruler.haloExtraPixels : DEFAULT_HALO_EXTRA_PX,
            labelFontSize: ruler.labelFontSize != null ? ruler.labelFontSize : DEFAULT_LABEL_FONT_SIZE,
        };
    }
}

export { RulerMeasurement };
