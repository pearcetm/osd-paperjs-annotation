
import { ScreenshotOverlay } from '../src/js/overlays/screenshot/screenshot.mjs';

const SETTINGS_KEY = 'osd-paperjs-annotation.screenshotOverlay.v1';

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
    const out = el('ss-settings-json');
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

function getTileSources() {
    // First source mirrors demo/demo.mjs (local file in demo/ if present/served).
    // Second source is a public DZI fallback.
    return [
        'https://openseadragon.github.io/example-images/highsmith/highsmith.dzi',
        {
            tileSource: {
                type: 'image',
                url: './grand-canyon-landscape-overlooking.jpg',
                buildPyramid: false,
            },
            x: 0,
        },
        // 'https://openseadragon.github.io/example-images/highsmith/highsmith.dzi',
    ];
}

const DSA_ITEM_ID = '5b9f00f7e62914002e94cf83';
const DSA_TILES_META_URL = `https://api.digitalslidearchive.org/api/v1/item/${DSA_ITEM_ID}/tiles`;
const DSA_DZI_URL = `https://api.digitalslidearchive.org/api/v1/item/${DSA_ITEM_ID}/tiles/dzi.dzi`;

async function prefetchDsaMpp() {
    try {
        const meta = await fetch(DSA_TILES_META_URL, { mode: 'cors' }).then(r => r.json());
        const mmX = Number(meta?.mm_x);
        const mmY = Number(meta?.mm_y);
        if (!Number.isFinite(mmX) || !Number.isFinite(mmY) || mmX <= 0 || mmY <= 0) {
            // eslint-disable-next-line no-console
            console.warn('DSA metadata missing mm_x/mm_y; skipping DSA slide.');
            return null;
        }
        const mpp = { x: mmX * 1000, y: mmY * 1000 }; // µm/px
        // eslint-disable-next-line no-console
        console.log('DSA metadata loaded; enabling WSI page with mpp:', mpp);
        return mpp;
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Could not fetch DSA /tiles metadata; skipping DSA slide.', e);
        return null;
    }
}

async function buildTileSourcesWithOptionalDsa() {
    const sources = getTileSources();
    const dsaMpp = await prefetchDsaMpp();
    if (dsaMpp) {
        sources.push(DSA_DZI_URL);
    }
    return { sources, dsaMpp, dsaPageIndex: dsaMpp ? sources.length - 1 : null };
}

function createViewer(tileSources) {
    return OpenSeadragon({
        element: 'screenshot-viewer',
        prefixUrl: 'https://openseadragon.github.io/openseadragon/images/',
        tileSources,
        sequenceMode: true,
        minZoomImageRatio: 0.01,
        visibilityRatio: 0,
        crossOriginPolicy: 'Anonymous',
        ajaxWithCredentials: false,
        drawer: 'canvas',
    });
}

let viewer = null;
let overlay = null;

async function setup() {
    const { sources, dsaMpp, dsaPageIndex } = await buildTileSourcesWithOptionalDsa();
    viewer = window.viewer = createViewer(sources);

    // Build overlay after first successful open.
    viewer.addOnceHandler('open', () => {
        overlay = window.screenshotOverlay = new ScreenshotOverlay(viewer, {});
        writeSettingsView();
    });

    // Attach mpp when the DSA tile source is opened and instantiated.
    viewer.addHandler('open', () => {
        if (!dsaMpp || dsaPageIndex == null) return;
        if (typeof viewer.currentPage === 'function' && viewer.currentPage() !== dsaPageIndex) return;
        const item = viewer.world?.getItemAt?.(0);
        if (!item?.source) return;
        item.source.mpp = dsaMpp;
        // eslint-disable-next-line no-console
        console.log('Attached DSA mpp (µm/px) on open:', dsaMpp);
    });
}

function reloadViewer() {
    if (!viewer) return;
    // Rebuild sources with optional DSA support.
    buildTileSourcesWithOptionalDsa().then(({ sources }) => {
        viewer.open(sources);
        viewer.goToPage(0);
    });
}

function wireControls() {
    el('ss-reset-settings')?.addEventListener('click', () => {
        try {
            window.localStorage.removeItem(SETTINGS_KEY);
        } catch {
            // ignore
        }
        writeSettingsView();
        // If overlay is already constructed, refresh its in-memory settings on next open.
    });
    el('ss-refresh-settings')?.addEventListener('click', () => writeSettingsView());
    el('ss-reload-viewer')?.addEventListener('click', () => reloadViewer());
}

wireControls();
setup();

