import { ConfigurationWidget } from '../src/js/overlays/configuration/configuration.mjs';
import { ScalebarOverlay } from '../src/js/overlays/scalebar/scalebar.mjs';
import { SCALEBAR_SETTINGS_STORAGE_KEY } from '../src/js/overlays/scalebar/scalebar-settings.mjs';
import {
    attachMppToViewerItem,
    createDsaViewer,
    prefetchDsaMpp,
} from './dsa-wsi.mjs';

function el(id) {
    return document.getElementById(id);
}

function readSettingsRaw() {
    try {
        return window.localStorage.getItem(SCALEBAR_SETTINGS_STORAGE_KEY);
    } catch {
        return null;
    }
}

function writeSettingsView() {
    const out = el('sb-settings-json');
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

let viewer = null;
let overlay = null;
let dsaMpp = null;

async function setup() {
    dsaMpp = await prefetchDsaMpp();
    const notice = el('sb-dsa-network-notice');
    if (notice) notice.hidden = Boolean(dsaMpp);

    viewer = window.viewer = createDsaViewer('scalebar-viewer');

    viewer.addOnceHandler('open', () => {
        if (dsaMpp) attachMppToViewerItem(viewer, dsaMpp);

        new ConfigurationWidget(viewer, {
            storageKey: 'osd-paperjs-demo-scalebar-config',
        });
        overlay = window.scalebarOverlay = new ScalebarOverlay(viewer);
        writeSettingsView();
    });
}

el('sb-reset-settings')?.addEventListener('click', () => {
    try {
        window.localStorage.removeItem(SCALEBAR_SETTINGS_STORAGE_KEY);
    } catch {
        /* */
    }
    writeSettingsView();
    location.reload();
});

el('sb-refresh-settings')?.addEventListener('click', () => writeSettingsView());

setup();
