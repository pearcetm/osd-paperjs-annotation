/**
 * OpenSeadragon paperjs overlay plugin based on paper.js
 * @version 0.4.13
 *
 * Copyright (c) 2022-2024, Thomas Pearce
 * All rights reserved.
 */

import { MultiLinestring } from './multilinestring.mjs';
import { paper } from '../paperjs.mjs';

// Segment group layout: exactly 4 children (must match ruler.mjs)
const SEGMENT_HALO = 0;
const SEGMENT_PATH = 1;
const SEGMENT_STROKE_LABEL = 2;
const SEGMENT_FILL_LABEL = 3;

const RULER_LABEL_STROKE_PX = 3;
const DEFAULT_STROKE_WIDTH_PX = 2;
const DEFAULT_HALO_EXTRA_PX = 2;
const DEFAULT_LABEL_FONT_SIZE = 12;

/**
 * Build one 4-child segment group from a path and saved measurement properties.
 * Used when loading from GeoJSON; does not depend on ruler tool.
 * @param {paper.Path} path - existing path (two segments)
 * @param {Object} props - geometry.properties (lengths, units, strokeWidthPixels, haloExtraPixels, labelFontSize, etc.)
 * @param {number} index - segment index
 * @returns {paper.Group}
 */
function buildSegmentGroupFromPath(path, props, index) {
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
        point: midpoint.clone(),
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
        point: midpoint.clone(),
        content: lengthDisplay,
        fontSize: labelFontSize,
        fillColor,
        justification: 'center',
    });
    fillLabel.rescale = { fontSize: (z) => labelFontSize / z };

    const group = new paper.Group();
    group.addChild(haloPath);
    group.addChild(path);
    group.addChild(strokeLabel);
    group.addChild(fillLabel);
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
            return;
        }

        const children = grp.children.slice();
        grp.removeChildren();
        for (let i = 0; i < children.length; i++) {
            const path = children[i];
            const segGroup = buildSegmentGroupFromPath(path, props, i);
            grp.addChild(segGroup);
        }

        grp.data.ruler = {
            units: props.units != null ? props.units : 'px',
            unitsPerPixel: props.unitsPerPixel != null ? props.unitsPerPixel : 1,
            strokeWidthPixels: props.strokeWidthPixels != null ? props.strokeWidthPixels : DEFAULT_STROKE_WIDTH_PX,
            haloExtraPixels: props.haloExtraPixels != null ? props.haloExtraPixels : DEFAULT_HALO_EXTRA_PX,
            labelFontSize: props.labelFontSize != null ? props.labelFontSize : DEFAULT_LABEL_FONT_SIZE,
        };
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
