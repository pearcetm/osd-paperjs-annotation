
import { AnnotationToolkit } from '../src/js/annotationtoolkit.mjs';
import { RotationControlOverlay } from '../src/js/rotationcontrol.mjs';

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

    $.get('./demo-annotation.json').then(x=>tk.addFeatureCollections(x))
});



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
        v3.annotationToolkit.destroy();
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

"https://oin-hotosm.s3.amazonaws.com/59c66c5223c8440011d7b1e4/0/7ad397c0-bba2-4f98-a08a-931ec3a6e943.tif"