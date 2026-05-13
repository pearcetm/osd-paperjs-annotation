import {
    ANNOTATION_TOOLBAR_PERSIST_ID_FILE,
    ANNOTATION_TOOLBAR_PERSIST_ID_PENCIL,
    ConfigurationWidget,
} from '../src/js/overlays/configuration/configuration.mjs';
import { RotationControlOverlay } from '../src/js/rotationcontrol.mjs';
import { ScreenshotOverlay } from '../src/js/overlays/screenshot/screenshot.mjs';
import { FieldOfViewOverlay } from '../src/js/overlays/fieldofview/fieldofview.mjs';
import { AnnotationToolkit } from '../src/js/annotationtoolkit.mjs';

const osdOpts = (element) => ({
    element,
    prefixUrl: 'https://openseadragon.github.io/openseadragon/images/',
    tileSources: [{
        tileSource: {
            type: 'image',
            url: 'https://openseadragon.github.io/example-images/grand-canyon-landscape-overlooking.jpg',
            buildPyramid: false,
        },
        x: 0,
    }],
    minZoomImageRatio: 0.01,
    visibilityRatio: 0,
    crossOriginPolicy: 'Anonymous',
    ajaxWithCredentials: false,
});

/** localStorage keys used by this demo page (reset clears these, then re-seeds seeded scenarios). */
const LS_DEMO_KEYS = [
    'osd-paperjs-demo-config-persist-fresh',
    'osd-paperjs-demo-config-persist-seeded',
    'osd-paperjs-demo-config-annot-persist',
];

function seedDemoLocalStorage() {
    const seeded = 'osd-paperjs-demo-config-persist-seeded';
    if (localStorage.getItem(seeded) == null) {
        localStorage.setItem(seeded, JSON.stringify({
            v: 1,
            overlays: {
                RotationControlOverlay: { showButton: true },
                ScreenshotOverlay: { showButton: false },
                FieldOfViewOverlay: { showButton: true },
            },
        }));
    }
    const annot = 'osd-paperjs-demo-config-annot-persist';
    if (localStorage.getItem(annot) == null) {
        localStorage.setItem(annot, JSON.stringify({
            v: 1,
            overlays: {
                RotationControlOverlay: { showButton: true },
                ScreenshotOverlay: { showButton: true },
                FieldOfViewOverlay: { showButton: true },
                [ANNOTATION_TOOLBAR_PERSIST_ID_PENCIL]: { showButton: false },
                [ANNOTATION_TOOLBAR_PERSIST_ID_FILE]: { showButton: true },
            },
        }));
    }
}

seedDemoLocalStorage();

window.clearOsdConfigDemoLocalStorage = () => {
    LS_DEMO_KEYS.forEach((k) => {
        try {
            localStorage.removeItem(k);
        } catch (e) {
            /* */
        }
    });
    seedDemoLocalStorage();
    location.reload();
};

const annotationTools = ['default', 'style', 'select', 'transform', 'brush', 'ruler'];

function wireAnnotationScenario(viewer, configWidget) {
    const tk = new AnnotationToolkit(viewer, { cacheAnnotations: true });
    tk.addAnnotationUI({
        autoOpen: true,
        tools: annotationTools,
        addToolbar: true,
        addLayerUI: true,
        addFileButton: true,
    });
    tk.registerWithConfigurationWidget(configWidget);
}

// Scenario 1: All overlays + custom section (persistence off)
const viewer = window.viewer = OpenSeadragon(osdOpts('config-viewer'));
viewer.addHandler('open', () => {
    const configWidget = new ConfigurationWidget(viewer);
    new RotationControlOverlay(viewer);
    new ScreenshotOverlay(viewer);
    new FieldOfViewOverlay(viewer);

    const customEl = document.createElement('div');
    customEl.innerHTML = '<p style="margin:0;font-size:13px;color:#555;">This section was injected via <code>addSection()</code>. Toolbar toggles are not saved (no <code>storageKey</code>).</p>';
    configWidget.addSection('Custom Plugin', customEl);
});

// Scenario 2: Empty config widget (no overlays, no sections)
const viewer2 = OpenSeadragon(osdOpts('config-viewer-empty'));
viewer2.addHandler('open', () => {
    new ConfigurationWidget(viewer2);
});

// Scenario 3: Custom section only (no overlays)
const viewer3 = OpenSeadragon(osdOpts('config-viewer-custom-only'));
viewer3.addHandler('open', () => {
    const cw = new ConfigurationWidget(viewer3);
    const el = document.createElement('div');
    el.innerHTML = '<p style="margin:0;font-size:13px;color:#555;">Custom-only section content here.</p>';
    cw.addSection('My Plugin Settings', el);
});

// Scenario 4: All overlays, buttons initially hidden (persistence off)
const viewer4 = OpenSeadragon(osdOpts('config-viewer-no-buttons'));
viewer4.addHandler('open', () => {
    new ConfigurationWidget(viewer4);
    new RotationControlOverlay(viewer4, { showButton: false });
    new ScreenshotOverlay(viewer4, { showButton: false });
    new FieldOfViewOverlay(viewer4, { showButton: false });
});

// Scenario 5: Overlays + AnnotationToolkit, persistence off
const viewer5 = OpenSeadragon(osdOpts('config-viewer-annotations'));
viewer5.addHandler('open', () => {
    const configWidget = new ConfigurationWidget(viewer5);
    new RotationControlOverlay(viewer5);
    new ScreenshotOverlay(viewer5);
    new FieldOfViewOverlay(viewer5);
    wireAnnotationScenario(viewer5, configWidget);
});

// Scenario 6: Persistence on, unseeded key — defaults apply until the user toggles; reload restores last choice
const viewer6 = OpenSeadragon(osdOpts('config-viewer-persist-fresh'));
viewer6.addHandler('open', () => {
    const configWidget = new ConfigurationWidget(viewer6, {
        storageKey: 'osd-paperjs-demo-config-persist-fresh',
    });
    new RotationControlOverlay(viewer6);
    new ScreenshotOverlay(viewer6);
    new FieldOfViewOverlay(viewer6);
});

// Scenario 7: Persistence on, pre-seeded (screenshot toolbar button hidden on first visit)
const viewer7 = OpenSeadragon(osdOpts('config-viewer-persist-seeded'));
viewer7.addHandler('open', () => {
    const configWidget = new ConfigurationWidget(viewer7, {
        storageKey: 'osd-paperjs-demo-config-persist-seeded',
    });
    new RotationControlOverlay(viewer7);
    new ScreenshotOverlay(viewer7);
    new FieldOfViewOverlay(viewer7);
});

// Scenario 8: Annotations + persistence on (pre-seeded: pencil hidden, others on)
const viewer8 = OpenSeadragon(osdOpts('config-viewer-annot-persist'));
viewer8.addHandler('open', () => {
    const configWidget = new ConfigurationWidget(viewer8, {
        storageKey: 'osd-paperjs-demo-config-annot-persist',
    });
    new RotationControlOverlay(viewer8);
    new ScreenshotOverlay(viewer8);
    new FieldOfViewOverlay(viewer8);
    wireAnnotationScenario(viewer8, configWidget);
});
