import { AnnotationToolkit } from '../src/js/annotationtoolkit.mjs';
import { FieldOfViewOverlay } from '../src/js/overlays/fieldofview/fieldofview.mjs';
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

const DSA_ITEM_ID = '5b9f00f7e62914002e94cf83';
const DSA_TILES_META_URL = `https://api.digitalslidearchive.org/api/v1/item/${DSA_ITEM_ID}/tiles`;
const DSA_DZI_URL = `https://api.digitalslidearchive.org/api/v1/item/${DSA_ITEM_ID}/tiles/dzi.dzi`;

async function prefetchDsaMpp() {
    try {
        const meta = await fetch(DSA_TILES_META_URL, { mode: 'cors' }).then((r) => r.json());
        const mmX = Number(meta?.mm_x);
        const mmY = Number(meta?.mm_y);
        if (!Number.isFinite(mmX) || !Number.isFinite(mmY) || mmX <= 0 || mmY <= 0) {
            // eslint-disable-next-line no-console
            console.warn('DSA metadata missing mm_x/mm_y.');
            return null;
        }
        return { x: mmX * 1000, y: mmY * 1000 }; // µm/px
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Could not fetch DSA /tiles metadata.', e);
        return null;
    }
}

/**
 * Field-of-view demo only: `prefetchDsaMpp()` / `item.source.mpp` use **µm per source pixel** on `x`/`y`.
 * The ruler toolbar shows `paperDistance * unitsPerPixel` with a unit label; for **mm**,
 * `unitsPerPixel` must be **mm per source pixel** = `mpp.x / 1000` (same isotropic +X convention as FOV).
 *
 * @param {import('../src/js/annotationtoolkit.mjs').AnnotationToolkit} toolkit
 * @param {{ x: number, y: number } | null} mpp
 */
function applyFieldOfViewDemoRulerMmScale(toolkit, mpp) {
    if (!mpp || !Number.isFinite(mpp.x) || mpp.x <= 0) return;
    const ruler = toolkit.getTool?.('ruler');
    const tc = ruler?.getToolbarControl?.();
    if (!tc) return;
    const mmPerPx = mpp.x / 1000;
    tc.labelUnit = 'mm';
    tc.unitsPerPixel = mmPerPx;
    if (tc.unitsInput) tc.unitsInput.value = 'mm';
    if (tc.unitsPerPixelInput) tc.unitsPerPixelInput.value = String(mmPerPx);
    const lm = ruler._lastMeasurement;
    tc.updateMeasurement(lm?.p1 ?? null, lm?.p2 ?? null, lm?.distance ?? null);
    if (typeof ruler.refreshSegmentLabels === 'function') {
        ruler.refreshSegmentLabels();
    }
}

function createViewer(tileSource) {
    return OpenSeadragon({
        element: 'fieldofview-viewer',
        prefixUrl: 'https://openseadragon.github.io/openseadragon/images/',
        tileSources: [tileSource],
        sequenceMode: false,
        minZoomImageRatio: 0.01,
        visibilityRatio: 0,
        crossOriginPolicy: 'Anonymous',
        ajaxWithCredentials: false,
        drawer: 'canvas',
    });
}

let viewer = null;
let overlay = null;
let dsaMpp = null;

async function setup() {
    dsaMpp = await prefetchDsaMpp();
    viewer = window.viewer = createViewer(DSA_DZI_URL);

    viewer.addOnceHandler('open', () => {
        const item = viewer.world?.getItemAt?.(0);
        if (item?.source && dsaMpp) {
            item.source.mpp = dsaMpp;
        }
        const tk = new AnnotationToolkit(viewer, { addUI: false });
        tk.addTools(['default', 'ruler']);
        window.annotationToolkit = tk;

        overlay = window.fieldOfViewOverlay = new FieldOfViewOverlay(viewer);

        // Toolkit overlay on top + implicit `tiledImage.paperLayer` for ruler until FOV is brought forward.
        tk.overlay.bringToFront();

        setupRulerHeadlessButtonsAndOutlet(tk, {
            headlessControlsId: 'fov-ruler-headless-controls',
            toolOutletId: 'fov-ruler-headless-tool-outlet',
        });
        applyFieldOfViewDemoRulerMmScale(tk, dsaMpp);
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
}

wireControls();
setup();

