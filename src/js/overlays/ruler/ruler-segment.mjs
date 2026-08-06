/**
 * Shared visual helpers for two-point ruler segment groups (halo, path, label).
 * Used by the convenience RulerOverlay tool; toolkit RulerTool can adopt later.
 */

import { paper } from '../../paperjs.mjs';
import { formatDecimal } from '../../utils/measurementFormat.mjs';

export const SEGMENT_HALO = 0;
export const SEGMENT_PATH = 1;
export const SEGMENT_LABEL_GROUP = 2;

export const VIEWER_RULER_KIND = 'viewerRuler';

const LABEL_FONT_SIZE = 12;
const LABEL_GAP_PX = 4;
const LABEL_STROKE_PX = 3;
const STROKE_WIDTH_PX = 2;
const HALO_EXTRA_PX = 2;
const ZERO_LENGTH_EPSILON = 1e-6;

export { ZERO_LENGTH_EPSILON };

/**
 * @param {paper.Item|null|undefined} child
 * @returns {paper.Path|null}
 */
export function getPathFromSegmentChild(child) {
    if (!child) return null;
    if (child instanceof paper.Path) return child;
    if (child instanceof paper.Group && (child.children.length === 3 || child.children.length === 4)) {
        return child.children[SEGMENT_PATH];
    }
    return null;
}

/**
 * @param {number} zoomFactor view.scaling.x * layer.scaling.x (or view zoom proxy)
 */
function applyPathStyle(path, isPreview, zoomFactor) {
    const z = zoomFactor > 0 ? zoomFactor : 1;
    path.strokeWidth = STROKE_WIDTH_PX / z;
    path.rescale = { strokeWidth: STROKE_WIDTH_PX };
    path.strokeColor = new paper.Color('black');
    path.strokeCap = 'round';
    path.strokeJoin = 'round';
    if (isPreview) {
        path.dashArray = [6, 6];
        path.opacity = 0.8;
    } else {
        path.dashArray = null;
        path.opacity = 1;
    }
}

function applyHaloStyle(haloPath, zoomFactor) {
    const z = zoomFactor > 0 ? zoomFactor : 1;
    const haloWidthPixels = STROKE_WIDTH_PX + HALO_EXTRA_PX;
    haloPath.strokeWidth = haloWidthPixels / z;
    haloPath.rescale = { strokeWidth: haloWidthPixels };
    haloPath.strokeColor = 'white';
    haloPath.strokeCap = 'round';
    haloPath.strokeJoin = 'round';
}

/**
 * @param {object} scale
 * @param {number} scale.unitsPerPixel
 * @param {string} scale.labelUnit
 * @param {number} [scale.decimals]
 * @param {string} [scale.roundingMode]
 */
export function formatRulerDistance(distancePaper, scale) {
    if (distancePaper == null || typeof distancePaper !== 'number') return '—';
    const unitsPerPixel = Number(scale?.unitsPerPixel);
    const upp = Number.isFinite(unitsPerPixel) && unitsPerPixel > 0 ? unitsPerPixel : 1;
    const unit = scale?.labelUnit || 'px';
    const value = distancePaper * upp;
    return `${formatDecimal(value, scale?.decimals ?? 2, scale?.roundingMode ?? 'round')} ${unit}`;
}

/**
 * @param {paper.PointText} label
 * @param {paper.Point} p1
 * @param {paper.Point} p2
 * @param {paper.Point} midpoint
 */
export function computeLabelPlacementCenter(label, p1, p2, midpoint) {
    const segmentDir = p2.subtract(p1);
    const segmentLength = segmentDir.length;
    if (segmentLength < ZERO_LENGTH_EPSILON) return midpoint;

    const normalizedDir = segmentDir.normalize();
    const normal = new paper.Point(normalizedDir.y, -normalizedDir.x);
    const zoomFactor = (label.view?.scaling?.x || 1) * (label.layer?.scaling?.x || 1);
    const gapPaper = LABEL_GAP_PX / (zoomFactor || 1);
    const labelBounds = (label.getInternalBounds && label.getInternalBounds()) ? label.getInternalBounds() : label.bounds;
    const labelHeight = labelBounds ? labelBounds.height : 0;
    const offset = labelHeight / 2 + gapPaper;
    return midpoint.add(normal.multiply(offset));
}

/**
 * Refresh label content/position and sync halo to path.
 * @param {paper.Group} segmentGroup
 * @param {object} scale formatRulerDistance scale
 * @param {number} [distanceOverride] when set, use this paper/image distance instead of path length
 */
export function refreshSegmentLabel(segmentGroup, scale, distanceOverride) {
    if (!segmentGroup || segmentGroup.children.length !== 3) return;
    const path = segmentGroup.children[SEGMENT_PATH];
    const labelGroup = segmentGroup.children[SEGMENT_LABEL_GROUP];
    const haloPath = segmentGroup.children[SEGMENT_HALO];
    if (!path || path.segments.length < 2 || !labelGroup || labelGroup.children.length < 2) return;

    const strokeLabel = labelGroup.children[0];
    const fillLabel = labelGroup.children[1];
    const p1 = path.segments[0].point;
    const p2 = path.segments[1].point;
    const distance = (typeof distanceOverride === 'number' && Number.isFinite(distanceOverride))
        ? distanceOverride
        : p1.getDistance(p2);
    const midpoint = p1.add(p2).divide(2);
    const formatted = formatRulerDistance(distance, scale);
    const fillColor = path.strokeColor || new paper.Color('black');

    fillLabel.justification = 'center';
    fillLabel.fillColor = fillColor;
    fillLabel.strokeColor = null;
    fillLabel.content = formatted;
    fillLabel.rescale = fillLabel.rescale || {};
    fillLabel.rescale.fontSize = (z) => LABEL_FONT_SIZE / z;
    delete fillLabel.rescale.strokeWidth;

    strokeLabel.justification = 'center';
    strokeLabel.strokeColor = 'white';
    strokeLabel.fillColor = null;
    strokeLabel.content = formatted;
    strokeLabel.rescale = strokeLabel.rescale || {};
    strokeLabel.rescale.fontSize = (z) => LABEL_FONT_SIZE / z;
    strokeLabel.rescale.strokeWidth = (z) => LABEL_STROKE_PX / z;

    if (fillLabel.applyRescale) fillLabel.applyRescale();
    if (strokeLabel.applyRescale) strokeLabel.applyRescale();

    const labelHeight = (fillLabel.getInternalBounds && fillLabel.getInternalBounds())
        ? fillLabel.getInternalBounds().height
        : (fillLabel.bounds ? fillLabel.bounds.height : 0);
    if (labelHeight > 0) {
        fillLabel.point = new paper.Point(0, labelHeight / 2);
        strokeLabel.point = new paper.Point(0, labelHeight / 2);
        labelGroup.pivot = new paper.Point(0, labelHeight / 2);
    }
    labelGroup.position = computeLabelPlacementCenter(fillLabel, p1, p2, midpoint).clone();

    if (haloPath instanceof paper.Path && haloPath.segments.length === path.segments.length) {
        path.segments.forEach((seg, i) => {
            haloPath.segments[i].point = seg.point.clone();
        });
    }
}

/**
 * @param {paper.Point} p1
 * @param {paper.Point} p2
 * @param {object} [options]
 * @param {boolean} [options.preview]
 * @param {number} [options.zoomFactor]
 * @param {object} [options.scale]
 * @returns {paper.Group}
 */
export function buildSegmentGroup(p1, p2, options = {}) {
    const isPreview = !!options.preview;
    const zoomFactor = options.zoomFactor > 0 ? options.zoomFactor : 1;
    const scale = options.scale || { unitsPerPixel: 1, labelUnit: 'px' };

    const haloPath = new paper.Path([p1.clone(), p2.clone()]);
    applyHaloStyle(haloPath, zoomFactor);
    const path = new paper.Path([p1.clone(), p2.clone()]);
    applyPathStyle(path, isPreview, zoomFactor);

    const distance = p1.getDistance(p2);
    const formatted = formatRulerDistance(distance, scale);
    const fillColor = path.strokeColor || new paper.Color('black');
    const midpoint = p1.add(p2).divide(2);

    const strokeLabel = new paper.PointText({
        point: new paper.Point(0, 0),
        content: formatted,
        fontSize: LABEL_FONT_SIZE,
        fillColor: null,
        strokeColor: 'white',
        justification: 'center',
    });
    strokeLabel.rescale = {
        fontSize: (z) => LABEL_FONT_SIZE / z,
        strokeWidth: (z) => LABEL_STROKE_PX / z,
    };
    const fillLabel = new paper.PointText({
        point: new paper.Point(0, 0),
        content: formatted,
        fontSize: LABEL_FONT_SIZE,
        fillColor,
        justification: 'center',
    });
    fillLabel.rescale = { fontSize: (z) => LABEL_FONT_SIZE / z };

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
 * Wrap a segment group as an owned viewer ruler measurement.
 * @param {paper.Group} segmentGroup
 * @returns {paper.Group}
 */
export function wrapViewerRulerMeasurement(segmentGroup) {
    const wrap = new paper.Group();
    wrap.name = 'viewerRuler';
    wrap.data = { kind: VIEWER_RULER_KIND, schemaVersion: 1 };
    wrap.applyMatrix = false;
    wrap.addChild(segmentGroup);
    return wrap;
}

/**
 * @param {paper.Item|null} item
 * @returns {paper.Item|null} Root viewerRuler group
 */
export function findViewerRulerRoot(item) {
    let cur = item;
    while (cur) {
        if (cur.name === 'viewerRuler' || cur.data?.kind === VIEWER_RULER_KIND) return cur;
        cur = cur.parent;
    }
    return null;
}
