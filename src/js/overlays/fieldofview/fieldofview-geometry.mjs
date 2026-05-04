/**
 * Field of view: mpp validation, physical diameter → base pixels, project ↔ image for preview.
 */

import { OpenSeadragon } from '../../osd-loader.mjs';
import { paper } from '../../paperjs.mjs';

const FOV_DEBUG = true;
/** @param {...unknown} args */
function fovGeometryLog(...args) {
    if (FOV_DEBUG) console.log('[FOV geometry]', ...args);
}

/**
 * @param {OpenSeadragon.TiledImage} tiledImage
 * @returns {{ x: number, y: number } | null}
 */
export function mppFromTiledImage(tiledImage) {
    const mpp = tiledImage?.source?.mpp;
    if (!mpp) return null;
    const x = Number(mpp.x);
    const y = Number(mpp.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return null;
    return { x, y };
}

/**
 * Isotropic diameter along image +X (mpp.x), v1 policy per overlay spec.
 * @param {{ x: number, y: number }} mpp
 * @param {number} diameterPhysical
 * @param {'mm' | 'um'} unit
 */
export function diameterPhysicalToBasePixels(mpp, diameterPhysical, unit) {
    const d = Number(diameterPhysical);
    if (!mpp || !Number.isFinite(d) || d <= 0) return null;
    if (unit === 'um') {
        return d / mpp.x;
    }
    return (d * 1000) / mpp.x;
}

/**
 * Circle area in mm² from diameter in physical units (mm or µm).
 * @param {number} diameterPhysical
 * @param {'mm' | 'um'} unit
 * @returns {number|null}
 */
export function areaMm2FromDiameterPhysical(diameterPhysical, unit) {
    const d = Number(diameterPhysical);
    if (!Number.isFinite(d) || d <= 0) return null;
    const dMm = unit === 'um' ? d / 1000 : d;
    return Math.PI * (dMm / 2) ** 2;
}

/**
 * Diameter in physical `unit` (mm or µm) for a circle of the given area in mm².
 * @param {number} areaMm2
 * @param {'mm' | 'um'} unit
 * @returns {number|null}
 */
export function diameterPhysicalFromAreaMm2(areaMm2, unit) {
    const A = Number(areaMm2);
    if (!Number.isFinite(A) || A <= 0) return null;
    const dMm = 2 * Math.sqrt(A / Math.PI);
    if (unit === 'um') {
        return dMm * 1000;
    }
    return dMm;
}

/**
 * @param {OpenSeadragon.Viewer} viewer
 * @param {paper.PaperScope} paperScope
 * @param {paper.Point} projectPoint
 * @returns {OpenSeadragon.Point}
 */
export function projectPointToImagePoint(viewer, paperScope, projectPoint) {
    const vp = viewer.viewport;
    const viewPt = paperScope.view.projectToView(projectPoint);
    const viewerPt = new OpenSeadragon.Point(viewPt.x, viewPt.y);
    const viewportPt = vp.viewerElementToViewportCoordinates(viewerPt);
    return vp.viewportToImageCoordinates(viewportPt);
}

/**
 * @param {OpenSeadragon.Viewer} viewer
 * @param {paper.PaperScope} paperScope
 * @param {OpenSeadragon.Point} imagePoint
 * @returns {paper.Point}
 */
export function imagePointToProjectPoint(viewer, paperScope, imagePoint) {
    const vp = viewer.viewport;
    const viewportPt = vp.imageToViewportCoordinates(imagePoint.x, imagePoint.y);
    const viewerPt = vp.viewportToViewerElementCoordinates(viewportPt);
    return paperScope.view.viewToProject(new paper.Point(viewerPt.x, viewerPt.y));
}

/**
 * Preview circle in project space; committed drop uses centerImg + diameterPx on the tile layer.
 * @returns {{ centerProj: paper.Point, radiusProj: number, centerImg: OpenSeadragon.Point } | null}
 */
export function circlePreviewGeometryFromProjectPoint(viewer, paperScope, projectPoint, diameterPx) {
    const d = Number(diameterPx);
    if (!projectPoint || !Number.isFinite(d) || d <= 0) {
        fovGeometryLog('circlePreviewGeometryFromProjectPoint null (inputs)', {
            hasProjectPoint: Boolean(projectPoint),
            diameterPx: d,
        });
        return null;
    }
    const rPx = d / 2;
    const centerImg = projectPointToImagePoint(viewer, paperScope, projectPoint);
    if (
        !Number.isFinite(centerImg.x) ||
        !Number.isFinite(centerImg.y) ||
        Number.isNaN(centerImg.x) ||
        Number.isNaN(centerImg.y)
    ) {
        fovGeometryLog('circlePreviewGeometryFromProjectPoint null (centerImg NaN)', {
            centerImg: { x: centerImg.x, y: centerImg.y },
            projectPoint: { x: projectPoint.x, y: projectPoint.y },
        });
        return null;
    }
    const rimImg = new OpenSeadragon.Point(centerImg.x + rPx, centerImg.y);
    const centerProj = imagePointToProjectPoint(viewer, paperScope, centerImg);
    const rimProj = imagePointToProjectPoint(viewer, paperScope, rimImg);
    const radiusProj = centerProj.getDistance(rimProj);
    if (!Number.isFinite(radiusProj) || radiusProj <= 0) {
        fovGeometryLog('circlePreviewGeometryFromProjectPoint null (radiusProj)', {
            radiusProj,
            centerProj: { x: centerProj.x, y: centerProj.y },
            rimProj: { x: rimProj.x, y: rimProj.y },
        });
        return null;
    }
    return { centerProj, radiusProj, centerImg };
}
