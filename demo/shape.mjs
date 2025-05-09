
import { AnnotationToolkit } from '../src/js/annotationtoolkit.mjs';
import { RotationControlOverlay } from '../src/js/rotationcontrol.mjs';
import { ScreenshotOverlay } from '../src/js/overlays/screenshot/screenshot.mjs';
import { Rectangle } from '../src/js/paperitems/rectangle.mjs';

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
        "https://openseadragon.github.io/example-images/highsmith/highsmith.dzi"
    ],
    sequenceMode:true,
    minZoomImageRatio:0.01,
    visibilityRatio:0,
    crossOriginPolicy: 'Anonymous',
    ajaxWithCredentials: false,
    drawer:'webgl',
});
v1.addOnceHandler('open',()=>{
    
    // set up the annotation toolkit
    let tk = new AnnotationToolkit(v1, {cacheAnnotations:true});
    tk.addAnnotationUI({autoOpen:true});
    window.tk = tk;
    const featureCollection = tk.addEmptyFeatureCollectionGroup();

    const tiledImage = v1.world.getItemAt(0);
    const pixelInput = document.getElementById('pixels');
    const button = document.getElementById('rect');
    button.onclick = ()=> makeRect(pixelInput.value,tiledImage,featureCollection)

    // add event listeners to the openseadragon canvas
    let x = 0, y = 0;
    v1.canvas.addEventListener('mousemove', ev => {x = ev.offsetX; y = ev.offsetY; })
    v1.canvas.addEventListener('keydown', ev => {
        if(ev.key === 'b'){
            const pt = tiledImage.viewerElementToImageCoordinates(new OpenSeadragon.Point(x, y))
            makeRect(pixelInput.value, tiledImage, featureCollection, pt.x, pt.y)
        }
    })
});

function makeRect(pixels, tiledImage, fc, x, y){
    const bounds = tiledImage.viewportToImageRectangle(tiledImage.viewport.getBounds())
    const centerX = x || bounds.x + bounds.width/2;
    const centerY = y || bounds.y + bounds.height/2;
    const w = pixels;
    const h = pixels;

    const g = {
        type: 'Feature',
        geometry:{
            type:'Point',
            properties: {
                subtype: 'Rectangle',
                width: w,
                height: h,
            },
            coordinates:[
                centerX, centerY
            ]
        }
    }
    const r = new Rectangle(g)
    r.setStyle({
        rescale:{strokeWidth: 2},
        strokeColor: 'red',
    })
    window.r = r;

    fc.addChild(r.paperItem);
    r.paperItem.applyRescale();
    return r;
}
