import { AnnotationToolkit } from '../src/js/annotationtoolkit.mjs';
import { setupRulerHeadlessButtonsAndOutlet } from './headless-ruler-ui.mjs';

const commonViewerOpts = {
    prefixUrl: "https://openseadragon.github.io/openseadragon/images/",
    tileSources: [{
        tileSource: {
            type: 'image',
            url: './grand-canyon-landscape-overlooking.jpg',
            buildPyramid: false,
        },
        x: 0,
    }, "https://openseadragon.github.io/example-images/highsmith/highsmith.dzi"],
    sequenceMode: true,
    minZoomImageRatio: 0.01,
    crossOriginPolicy: 'Anonymous',
    ajaxWithCredentials: false,
    drawer: 'webgl',
};

const viewer = window.viewer = OpenSeadragon({
    element: 'ruler-viewer-headless',
    ...commonViewerOpts,
});

viewer.addOnceHandler('open', () => {
    const tk = new AnnotationToolkit(viewer, { addUI: false, cacheAnnotations: true });
    tk.addTools(['default', 'ruler']);
    window.tk = tk;

    setupRulerHeadlessButtonsAndOutlet(tk);
});
