import { ConfigurationWidget } from '../src/js/overlays/configuration/configuration.mjs';
import { RotationControlOverlay } from '../src/js/rotationcontrol.mjs';

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

// Scenario A: overlay only (no configuration widget)
const viewerA = OpenSeadragon(osdOpts('rotation-viewer'));
viewerA.addHandler('open', () => {
    new RotationControlOverlay(viewerA);
});

// Scenario B: configuration widget first, then overlay (auto-registers in the gear menu)
const viewerB = OpenSeadragon(osdOpts('rotation-viewer-config'));
viewerB.addHandler('open', () => {
    new ConfigurationWidget(viewerB);
    new RotationControlOverlay(viewerB);
});
