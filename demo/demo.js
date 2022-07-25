// import '../js/annotationui.js';
import { AnnotationUI } from '../js/annotationui.js';

let v1 = OpenSeadragon({
    element:'basic-viewer',
    prefixUrl: "https://openseadragon.github.io/openseadragon/images/",
    tileSources: {
        type: 'image',
        url:  'https://openseadragon.github.io/example-images/grand-canyon-landscape-overlooking.jpg',
        buildPyramid: false
    },
    minZoomImageRatio:0.01,
    visibilityRatio:0,
    crossOriginPolicy: 'Anonymous',
    ajaxWithCredentials: false
});

// let v2 = OpenSeadragon({
//     element:'demo-viewer',
//     prefixUrl:"https://openseadragon.github.io/openseadragon/images/",
//     tileSources: [{
//         //required	
//         type:       "zoomifytileservice",
//         width:      7026,
//         height:     9221,
//         tilesUrl:   "https://openseadragon.github.io/example-images/highsmith/highsmith_zdata/",
//         //optional
//         tileSize: 256,
//         fileFormat: 'jpg'	
//     }],,
//     minZoomImageRatio:0.01,
//     visibilityRatio:0,
//     crossOriginPolicy: 'Anonymous',
//     ajaxWithCredentials: false
// })

v1.addHandler('open',()=>new AnnotationUI(v1,{autoOpen:true}))