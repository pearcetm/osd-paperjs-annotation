import { ConfigurationWidget } from '../src/js/overlays/configuration/configuration.mjs';
import { RotationControlOverlay } from '../src/js/rotationcontrol.mjs';
import { ScreenshotOverlay } from '../src/js/overlays/screenshot/screenshot.mjs';
import { FieldOfViewOverlay } from '../src/js/overlays/fieldofview/fieldofview.mjs';

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

// Scenario 1: All overlays + custom section
const viewer = window.viewer = OpenSeadragon(osdOpts('config-viewer'));
viewer.addHandler('open', () => {
    const configWidget = new ConfigurationWidget(viewer);
    new RotationControlOverlay(viewer);
    new ScreenshotOverlay(viewer);
    new FieldOfViewOverlay(viewer);

    const customEl = document.createElement('div');
    customEl.innerHTML = '<p style="margin:0;font-size:13px;color:#555;">This section was injected via <code>addSection()</code>.</p>';
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

// Scenario 4: All overlays, buttons initially hidden
const viewer4 = OpenSeadragon(osdOpts('config-viewer-no-buttons'));
viewer4.addHandler('open', () => {
    new ConfigurationWidget(viewer4);
    new RotationControlOverlay(viewer4, { showButton: false });
    new ScreenshotOverlay(viewer4, { showButton: false });
    new FieldOfViewOverlay(viewer4, { showButton: false });
});
