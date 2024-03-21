
import { AnnotationToolkit } from '../src/js/annotationtoolkit.mjs';
import { RotationControlOverlay } from '../src/js/rotationcontrol.mjs';

let v1 =window.v1 = OpenSeadragon({
    element:'basic-viewer',
    prefixUrl: "https://openseadragon.github.io/openseadragon/images/",
    tileSources: [{
            tileSource:{
                    type: 'image',
                    url:  './grand-canyon-landscape-overlooking.jpg',
                    buildPyramid: false,
                },
            x:0,
        },
        // {
        //     tileSource:{
        //             type: 'image',
        //             url:  './grand-canyon-landscape-overlooking.jpg',
        //             buildPyramid: false,
        //         },
        //     x:1,
        // },
        "https://openseadragon.github.io/example-images/highsmith/highsmith.dzi"
    ],
    sequenceMode:true,
    minZoomImageRatio:0.01,
    visibilityRatio:0,
    crossOriginPolicy: 'Anonymous',
    ajaxWithCredentials: false,
    // gestureSettingsMouse:{
    //     dragToPan:false,
    // }
});
v1.addOnceHandler('open',()=>{
    new RotationControlOverlay(v1);
    let tk = new AnnotationToolkit(v1);
    tk.addAnnotationUI({autoOpen:true});
    window.tk = tk;

    fetch('./demo-annotation.json').then(x=>x.json()).then(x=>{
        //tk.addFeatureCollections(x);
        tk.addFeatureCollections(x, true, v1.world.getItemAt(0));
        // tk.addFeatureCollections(x, true, v1.world.getItemAt(1));
    });

    // v1.addTiledImage({
    //     tileSource:{
    //             type: 'image',
    //             url:  './grand-canyon-landscape-overlooking.jpg',
    //             buildPyramid: false,
    //         },
    //     x:1,
    //     index: -1,
    // },)
});




"https://oin-hotosm.s3.amazonaws.com/59c66c5223c8440011d7b1e4/0/7ad397c0-bba2-4f98-a08a-931ec3a6e943.tif"