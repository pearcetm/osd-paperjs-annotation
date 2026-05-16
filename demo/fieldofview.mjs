import { AnnotationToolkit } from '../src/js/annotationtoolkit.mjs';
import { FieldOfViewOverlay } from '../src/js/overlays/fieldofview/fieldofview.mjs';
import { applyRulerPhysicalScaleFromMpp } from '../src/js/utils/rulerPhysicalScale.mjs';
import {
    attachMppToViewerItem,
    createDsaViewer,
    DSA_DZI_URL,
    formatRulerScaleReadout,
    prefetchDsaMpp,
    syncRulerFromTileMpp,
} from './dsa-wsi.mjs';
import { setupRulerHeadlessButtonsAndOutlet } from './headless-ruler-ui.mjs';

const SETTINGS_KEY = 'osd-paperjs-annotation.fieldOfViewOverlay.v1';

function el(id) {
    return document.getElementById(id);
}

function readSettingsRaw() {
    try {
        return window.localStorage.getItem(SETTINGS_KEY);
    } catch {
        return null;
    }
}

function writeSettingsView() {
    const out = el('fov-settings-json');
    if (!out) return;
    const raw = readSettingsRaw();
    if (!raw) {
        out.textContent = '(no saved settings)';
        return;
    }
    try {
        out.textContent = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
        out.textContent = raw;
    }
}

function writeRulerScaleReadout(toolkit) {
    const out = el('fov-ruler-scale-readout');
    if (out) out.textContent = formatRulerScaleReadout(toolkit);
}

let viewer = null;
let overlay = null;
let toolkit = null;
let dsaMpp = null;

async function setup() {
    dsaMpp = await prefetchDsaMpp();
    const notice = el('fov-dsa-network-notice');
    if (notice) notice.hidden = Boolean(dsaMpp);

    viewer = window.viewer = createDsaViewer('fieldofview-viewer');

    viewer.addOnceHandler('open', () => {
        if (dsaMpp) attachMppToViewerItem(viewer, dsaMpp);

        toolkit = window.annotationToolkit = new AnnotationToolkit(viewer, { addUI: false });
        toolkit.addTools(['default', 'ruler']);

        overlay = window.fieldOfViewOverlay = new FieldOfViewOverlay(viewer);

        toolkit.overlay.bringToFront();

        setupRulerHeadlessButtonsAndOutlet(toolkit, {
            headlessControlsId: 'fov-ruler-headless-controls',
            toolOutletId: 'fov-ruler-headless-tool-outlet',
        });

        syncRulerFromTileMpp(viewer, toolkit);
        writeRulerScaleReadout(toolkit);
        writeSettingsView();
    });
}

function reloadViewer() {
    if (!viewer) return;
    viewer.open(DSA_DZI_URL);
}

function wireControls() {
    el('fov-reset-settings')?.addEventListener('click', () => {
        try {
            window.localStorage.removeItem(SETTINGS_KEY);
        } catch {
            // ignore
        }
        writeSettingsView();
    });
    el('fov-refresh-settings')?.addEventListener('click', () => writeSettingsView());
    el('fov-reload-viewer')?.addEventListener('click', () => reloadViewer());
    el('fov-ruler-scale-programmatic')?.addEventListener('click', () => {
        if (!toolkit || !dsaMpp) return;
        applyRulerPhysicalScaleFromMpp(toolkit, dsaMpp);
        writeRulerScaleReadout(toolkit);
    });
}

wireControls();
setup();
