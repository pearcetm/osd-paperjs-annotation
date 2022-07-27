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
v1.addHandler('open',()=>new AnnotationUI(v1,{autoOpen:true}));


let v2 = OpenSeadragon({
    element:'demo-viewer',
    prefixUrl:"https://openseadragon.github.io/openseadragon/images/",
    tileSources: [{
        //required	
        type:       "zoomifytileservice",
        width:      7026,
        height:     9221,
        tilesUrl:   "https://openseadragon.github.io/example-images/highsmith/highsmith_zdata/",
        //optional
        tileSize: 256,
        fileFormat: 'jpg'	
    }],
    minZoomImageRatio:0.01,
    visibilityRatio:0,
    crossOriginPolicy: 'Anonymous',
    ajaxWithCredentials: false
})
v2.addHandler('open',()=>new AnnotationUI(v2,{autoOpen:false}))

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
v3.addHandler('open',()=>{new AnnotationUI(v3,{autoOpen:true});window.ps=v3._paperjsOverlayInfo.ps});
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
