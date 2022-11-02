
import { AnnotationToolkit } from '../js/annotationtoolkit.js';
import { RotationControlOverlay } from '../js/rotationcontrol.js';

OpenSeadragon.Button.prototype.disable = function(){
    this.notifyGroupExit();
    this.element.disabled = true;
    this.tracker.setTracking(false);
    OpenSeadragon.setElementOpacity( this.element, 0.2, true );
}

OpenSeadragon.Button.prototype.enable = function(){
    this.element.disabled = false;
    this.tracker.setTracking(true);
    OpenSeadragon.setElementOpacity( this.element, 1.0, true );
    this.notifyGroupEnter();
}


// let v0 =window.v0 = OpenSeadragon({
//     element:'rotating-viewer',
//     prefixUrl: "https://openseadragon.github.io/openseadragon/images/",
//     tileSources: {
//         type: 'image',
//         url:  'https://openseadragon.github.io/example-images/grand-canyon-landscape-overlooking.jpg',
//         buildPyramid: false
//     },
//     minZoomImageRatio:0.01,
//     visibilityRatio:0,
//     crossOriginPolicy: 'Anonymous',
//     ajaxWithCredentials: false
// });
// v0.addHandler('open',()=>{
//     new RotationControlOverlay(v0);
// });


let v1 =window.v1 = OpenSeadragon({
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
v1.addHandler('open',()=>{
    new RotationControlOverlay(v1);
    let tk = new AnnotationToolkit(v1);
    tk.addAnnotationUI({autoOpen:true});
    window.tk = tk;
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
//     }],
//     minZoomImageRatio:0.01,
//     visibilityRatio:0,
//     crossOriginPolicy: 'Anonymous',
//     ajaxWithCredentials: false
// })
// v2.addHandler('open',()=>{
//     let tk = new AnnotationToolkit(v2);
//     tk.addAnnotationUI({autoOpen:false});
// });

let v3 = OpenSeadragon({
    element:'local-viewer',
    prefixUrl: "https://openseadragon.github.io/openseadragon/images/",
    // tileSources: {
    //     type: 'image',
    //     url:  'https://openseadragon.github.io/example-images/grand-canyon-landscape-overlooking.jpg',
    //     buildPyramid: false
    // },
    minZoomImageRatio:0.01,
    visibilityRatio:0,
    crossOriginPolicy: 'Anonymous',
    ajaxWithCredentials: false
});
v3.addHandler('open',()=>{
    if(v3.annotationToolkit){
        v3.annotationToolkit.remove();
    }
    let tk = new AnnotationToolkit(v3);
    tk.addAnnotationUI({autoOpen:true});
});
$(v3.element).closest('.demo').find('input[type="file"]').on('change',function(ev){
    // console.log('File input change',this,ev);
    let fr = new FileReader();
    let image = new Image(); 
    let filename=this.files[0].name;
    image.onload = function(){
        let ts={
            name:filename,
            width:this.naturalWidth,
            height:this.naturalHeight,
            type: 'image',
            url:  this.src,
            buildPyramid: false,
        }
        v3.open(ts);
    };    
    fr.onload = function(){
        image.src = this.result; 
    };
    fr.readAsDataURL(this.files[0]);
})

window.v3 = v3;

