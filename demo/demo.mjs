
import { AnnotationToolkit } from '../src/js/annotationtoolkit.mjs';
import { RotationControlOverlay } from '../src/js/rotationcontrol.mjs';
import { ScreenshotOverlay } from '../src/js/overlays/screenshot/screenshot.mjs';

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
    new RotationControlOverlay(v1);
    new ScreenshotOverlay(v1);
    let tk = new AnnotationToolkit(v1, {cacheAnnotations:true});
    tk.addAnnotationUI({autoOpen:true});
    window.tk = tk;

    fetch('./demo-annotation.json').then(x=>x.json()).then(x=>{
        tk.addFeatureCollections(x, true, v1.world.getItemAt(0));
    });

});

if(document.getElementById('local-viewer')){
    let v2 = window.v2 = OpenSeadragon({
        element:'local-viewer',
        prefixUrl: "https://openseadragon.github.io/openseadragon/images/",
        minZoomImageRatio:0.01,
        visibilityRatio:0,
        crossOriginPolicy: 'Anonymous',
        ajaxWithCredentials: false,
        drawer:'webgl',
        sequenceMode:true,
    });
    
    v2.addHandler('page',ev=>{
        //console.log('page',ev);
        let ts=ev.eventSource.tileSources[ev.page];
        if(!ts.ready && ts.file && ts.file.constructor === File){
            let fr = new FileReader();
            fr.readAsDataURL(v2.tileSources[ev.page].file);
            fr.onload = () => ts.getImageInfo(fr.result);
            // fr.onload = () => {
            //     const img = document.createElement('img');
            //     document.body.appendChild(img);
            //     img.src = fr.result;
            // }
        }
    })
    
    new RotationControlOverlay(v2);
    new ScreenshotOverlay(v2);
    let tk2 = new AnnotationToolkit(v2, {cacheAnnotations:true});
    tk2.addAnnotationUI({autoOpen:true});
    window.tk2 = tk2;
    
    document.querySelector('input[type=file]').addEventListener('change',function(){
        let tileSources = Array.from(this.files).map(imageTileSource);
        v2.open(tileSources);
        v2.goToPage(0);
    })

}


function imageTileSource(file){
    let obj = {
        url:'',
        file:file,
        name:file.name,
    }
    let ts = new OpenSeadragon.ImageTileSource(obj);
    ts.ready=false;
    let origDestroy = ts.destroy;
    ts.destroy = function(){origDestroy.call(ts); ts.ready = false;}
    return ts;
}


"https://oin-hotosm.s3.amazonaws.com/59c66c5223c8440011d7b1e4/0/7ad397c0-bba2-4f98-a08a-931ec3a6e943.tif"