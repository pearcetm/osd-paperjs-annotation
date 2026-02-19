
import { AnnotationToolkit } from '../src/js/annotationtoolkit.mjs';

let v1 = window.v1 = OpenSeadragon({
    element: 'ruler-viewer',
    prefixUrl: "https://openseadragon.github.io/openseadragon/images/",
    tileSources: [{
            tileSource: {
                type: 'image',
                url: './grand-canyon-landscape-overlooking.jpg',
                buildPyramid: false,
            },
            x: 0,
        },
        "https://openseadragon.github.io/example-images/highsmith/highsmith.dzi"
    ],
    sequenceMode: true,
    minZoomImageRatio: 0.01,
    visibilityRatio: 0,
    crossOriginPolicy: 'Anonymous',
    ajaxWithCredentials: false,
    drawer: 'webgl',
});
v1.addOnceHandler('open', () => {
    let tk = new AnnotationToolkit(v1, { cacheAnnotations: true });
    tk.addAnnotationUI({ autoOpen: true, tools: ['default', 'ruler'] });
    window.tk = tk;
});
