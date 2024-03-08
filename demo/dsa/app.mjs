
import { AnnotationToolkit } from '../../src/js/annotationtoolkit.mjs';
import { DSAUserInterface } from './dsauserinterface.mjs';
import { RotationControlOverlay } from '../../src/js/rotationcontrol.mjs';


// let styledef;
// let examples;
$(window).on('beforeunload',function(){
    return 'Are you sure you want to leave?';
})
// $.get('./init.geoJSON').then(x=>{
//     styledef=x;
// });
// $.get('./Examples.json').then(x=>{
//     examples=x;
// });

let v1 = createViewer();

v1.addOnceHandler('open',()=>{
    v1.viewport.zoomTo(0.01,null,true);
    v1.viewport.zoomTo(0.5);
})
v1.open(
    {
        type: 'image',
        url:  './dsa_logo.svg',
        buildPyramid: false
    }
)

// DSA setup

let dsaUI = new DSAUserInterface(v1);

dsaUI.header.appendTo('.dsa-ui-container');
dsaUI.annotationEditorGUI.appendTo('#dsa-gui');

// Local file setup

$('#file-picker').on('change',function(){
   let tileSources = Array.from(this.files).map(imageTileSource);
    v1.open(tileSources);
    v1.goToPage(0);
})


// Viewer creation and annotation setup

function createViewer(){
    let viewer = window.viewer = OpenSeadragon({
        element:'viewer',
        prefixUrl: "https://openseadragon.github.io/openseadragon/images/",
        minZoomImageRatio:0.01,
        maxZoomPixelRatio:16,
        visibilityRatio:0,
        crossOriginPolicy: 'Anonymous',
        ajaxWithCredentials: false,
        sequenceMode:true,
        showNavigator:true,
    });

    new RotationControlOverlay(viewer);
    
    viewer.addHandler('page',ev=>{
        //console.log('page',ev);
        let ts=ev.eventSource.tileSources[ev.page];
        if(!ts.ready && ts.file && ts.file.constructor === File){
            let fr = new FileReader();
            fr.readAsDataURL(v1.tileSources[ev.page].file);
            fr.onload = () => ts.getImageInfo(fr.result);
        }
        
        // tk defined at containing scope
        let tk = new AnnotationToolkit(v1);

        // add project to window for debugging
        window.project = tk.overlay.paperScope.project;
        
        tk.addOnceHandler('before-destroy',(ev)=>{
            ts.annotationStore = tk.toGeoJSON();
        })
        let ui=tk.addAnnotationUI({
            autoOpen:true,
            addLayerDialog:false,

        });
        $(ui._layerUI.element).appendTo($('#paper-gui')).on('element-added',(ev)=>{
            let scrollToElement = $(ev.target);
            scrollToElement && setTimeout(()=>{
                scrollToElement[0].scrollIntoView({block: "nearest", inline: "nearest"})
            }, 0);
        });
        $(ui._layerUI.element).find('input.annotation-fill-opacity').val('0.5').trigger('input');

        // $('#current-file').text(`${ts.name} (${ev.page+1} of ${ev.eventSource.tileSources.length})`)

    })
    return viewer;
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
