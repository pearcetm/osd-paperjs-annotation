import { mppFromActiveViewerImage } from '../src/js/utils/mpp.mjs';
import { applyRulerPhysicalScaleFromMpp } from '../src/js/utils/rulerPhysicalScale.mjs';

export const DSA_ITEM_ID = '5b9f00f7e62914002e94cf83';
export const DSA_TILES_META_URL = `https://api.digitalslidearchive.org/api/v1/item/${DSA_ITEM_ID}/tiles`;
export const DSA_DZI_URL = `https://api.digitalslidearchive.org/api/v1/item/${DSA_ITEM_ID}/tiles/dzi.dzi`;

/**
 * @returns {Promise<{ x: number, y: number } | null>} µm/px, or null if fetch/validation fails
 */
export async function prefetchDsaMpp() {
    try {
        const meta = await fetch(DSA_TILES_META_URL, { mode: 'cors' }).then((r) => r.json());
        const mmX = Number(meta?.mm_x);
        const mmY = Number(meta?.mm_y);
        if (!Number.isFinite(mmX) || !Number.isFinite(mmY) || mmX <= 0 || mmY <= 0) {
            // eslint-disable-next-line no-console
            console.warn('DSA metadata missing mm_x/mm_y.');
            return null;
        }
        const mpp = { x: mmX * 1000, y: mmY * 1000 };
        // eslint-disable-next-line no-console
        console.log('DSA metadata loaded; mpp (µm/px):', mpp);
        return mpp;
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Could not fetch DSA /tiles metadata.', e);
        return null;
    }
}

/**
 * @param {OpenSeadragon.Viewer} viewer
 * @param {{ x: number, y: number } | null} mpp
 * @returns {boolean}
 */
export function attachMppToViewerItem(viewer, mpp) {
    if (!mpp || !viewer?.world || viewer.world.getItemCount() !== 1) return false;
    const item = viewer.world.getItemAt(0);
    if (!item?.source) return false;
    item.source.mpp = mpp;
    return true;
}

/**
 * @param {string} elementId
 * @param {object} [opts]
 * @returns {OpenSeadragon.Viewer}
 */
export function createDsaViewer(elementId, opts = {}) {
    return OpenSeadragon({
        element: elementId,
        prefixUrl: 'https://openseadragon.github.io/openseadragon/images/',
        tileSources: opts.tileSources ?? DSA_DZI_URL,
        sequenceMode: opts.sequenceMode ?? false,
        minZoomImageRatio: 0.01,
        visibilityRatio: 0,
        crossOriginPolicy: 'Anonymous',
        ajaxWithCredentials: false,
        drawer: opts.drawer ?? 'canvas',
    });
}

/**
 * @param {OpenSeadragon.Viewer} viewer
 * @param {import('../src/js/annotationtoolkit.mjs').AnnotationToolkit} toolkit
 * @param {{ unit?: 'mm' | 'um' }} [options]
 * @returns {boolean}
 */
export function syncRulerFromTileMpp(viewer, toolkit, options) {
    return applyRulerPhysicalScaleFromMpp(toolkit, mppFromActiveViewerImage(viewer), options);
}

/**
 * @param {import('../src/js/annotationtoolkit.mjs').AnnotationToolkit} toolkit
 * @returns {string}
 */
export function formatRulerScaleReadout(toolkit) {
    const tc = toolkit.getTool?.('ruler')?.getToolbarControl?.();
    if (!tc) return '(ruler not in toolset)';
    return `labelUnit: ${tc.labelUnit}, unitsPerPixel: ${tc.unitsPerPixel}`;
}
