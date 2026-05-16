import { AnnotationToolkit } from '../src/js/annotationtoolkit.mjs';
import { applyRulerPhysicalScaleFromMpp } from '../src/js/utils/rulerPhysicalScale.mjs';
import {
    attachMppToViewerItem,
    createDsaViewer,
    formatRulerScaleReadout,
    prefetchDsaMpp,
    syncRulerFromTileMpp,
} from './dsa-wsi.mjs';
import { setupRulerHeadlessButtonsAndOutlet } from './headless-ruler-ui.mjs';

const PX_TILE_SOURCE = {
    tileSource: {
        type: 'image',
        url: './grand-canyon-landscape-overlooking.jpg',
        buildPyramid: false,
    },
    x: 0,
};

let dsaMpp = null;

function el(id) {
    return document.getElementById(id);
}

function writeReadout(readoutId, toolkit) {
    const out = el(readoutId);
    if (out) out.textContent = formatRulerScaleReadout(toolkit);
}

function setupPxViewer() {
    const viewer = OpenSeadragon({
        element: 'ruler-viewer-px',
        prefixUrl: 'https://openseadragon.github.io/openseadragon/images/',
        tileSources: [PX_TILE_SOURCE],
        sequenceMode: false,
        minZoomImageRatio: 0.01,
        visibilityRatio: 0,
        crossOriginPolicy: 'Anonymous',
        ajaxWithCredentials: false,
        drawer: 'webgl',
    });

    viewer.addOnceHandler('open', () => {
        const tk = new AnnotationToolkit(viewer, { addUI: false, cacheAnnotations: true });
        tk.addTools(['default', 'ruler']);
        window.tkPx = tk;
        setupRulerHeadlessButtonsAndOutlet(tk, {
            headlessControlsId: 'ruler-px-headless-controls',
            toolOutletId: 'ruler-px-headless-tool-outlet',
        });
        writeReadout('ruler-px-scale-readout', tk);
    });
}

function setupWsiTileMppViewer() {
    const viewer = createDsaViewer('ruler-viewer-wsi-tile');

    viewer.addOnceHandler('open', () => {
        if (dsaMpp) attachMppToViewerItem(viewer, dsaMpp);

        const tk = new AnnotationToolkit(viewer, { addUI: false, cacheAnnotations: true });
        tk.addTools(['default', 'ruler']);
        window.tkWsiTile = tk;
        setupRulerHeadlessButtonsAndOutlet(tk, {
            headlessControlsId: 'ruler-wsi-tile-headless-controls',
            toolOutletId: 'ruler-wsi-tile-headless-tool-outlet',
        });
        syncRulerFromTileMpp(viewer, tk);
        writeReadout('ruler-wsi-tile-scale-readout', tk);
    });
}

function setupWsiProgrammaticViewer() {
    const viewer = createDsaViewer('ruler-viewer-wsi-programmatic');

    viewer.addOnceHandler('open', () => {
        const tk = new AnnotationToolkit(viewer, { addUI: false, cacheAnnotations: true });
        tk.addTools(['default', 'ruler']);
        window.tkWsiProgrammatic = tk;
        setupRulerHeadlessButtonsAndOutlet(tk, {
            headlessControlsId: 'ruler-wsi-programmatic-headless-controls',
            toolOutletId: 'ruler-wsi-programmatic-headless-tool-outlet',
        });
        if (dsaMpp) applyRulerPhysicalScaleFromMpp(tk, dsaMpp);
        writeReadout('ruler-wsi-programmatic-scale-readout', tk);
    });
}

async function setup() {
    dsaMpp = await prefetchDsaMpp();
    const notice = el('ruler-dsa-network-notice');
    if (notice) notice.hidden = Boolean(dsaMpp);

    setupPxViewer();
    if (dsaMpp) {
        setupWsiTileMppViewer();
        setupWsiProgrammaticViewer();
    } else {
        el('ruler-wsi-sections')?.setAttribute('hidden', '');
    }
}

setup();
