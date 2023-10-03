
import { AnnotationToolkit } from '../../src/js/annotationtoolkit.mjs';
let styledef;
$.get('./init.geoJSON').then(x=>{
    styledef=x;
})

let v1 = createViewer();
v1.addOnceHandler('open',()=>{
    v1.viewport.zoomTo(0.01,null,true);
    v1.viewport.zoomTo(0.5);
})
v1.open(
    {
        type: 'image',
        url:  './sugarbug-doug-logo.jpg',
        buildPyramid: false
    }
)

$('#file-picker').on('change',function(){
    // console.log('file-picker change', ev, this);
   let tileSources = Array.from(this.files).map(file=>{
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
    });
    v1.open(tileSources);
    v1.goToPage(0);
})

$('#get-results').on('click',function(){
    //get current annotations
    if(!v1.annotationToolkit) return;
    v1.tileSources[v1.currentPage()].annotationStore = v1.annotationToolkit.toGeoJSON();
    let zip = new JSZip();
    let files=v1.tileSources.filter(ts=>ts.annotationStore).map(ts=>{
        let p = new paper.PaperScope();
        p.setup();
        let background = new paper.Path.Rectangle(new paper.Point(0,0), new paper.Size(ts.width, ts.height));
        background.fillColor = 'black';
        p.project.activeLayer.addChild(background);
        ts.annotationStore.forEach(fc=>{
            fc.features.forEach(f=>{
                let item = paper.Item.fromGeoJSON(f);
                if(!item.intersect){
                    item.remove();
                    return;
                }
                let toAdd = item.intersect(background);
                toAdd.strokeWidth = 0;
                toAdd.fillColor = 'white';
                p.project.activeLayer.addChild(toAdd);
                item.remove();
            })
        })
        
        let gjname = ts.file.name+'.geoJSON';
        let geoJSON = JSON.stringify(ts.annotationStore);
        

        let rastername=ts.file.name+'.mask.png';
        let raster=p.project.activeLayer.scale(1/p.view.pixelRatio).rasterize({insert:false});
        let dataurl = raster.toDataURL();
        return fetch(dataurl).then(res => res.blob()).then(blob => {
            zip.file(rastername, blob);
            zip.file(gjname, geoJSON);
        });

    });
    Promise.all(files).then(()=>zip.generateAsync({type:'blob'}).then(blob=>saveAs(blob, "sugarbug.zip")) );
})

function createViewer(){
    let viewer = window.viewer = OpenSeadragon({
        element:'viewer',
        prefixUrl: "https://openseadragon.github.io/openseadragon/images/",
        // prefixUrl:'/local/openseadragon/3.1.0/images/',
        minZoomImageRatio:0.01,
        maxZoomPixelRatio:16,
        visibilityRatio:0,
        crossOriginPolicy: 'Anonymous',
        ajaxWithCredentials: false,
        sequenceMode:true,
        // constrainDuringPan:true,
    });
    
    viewer.addHandler('page',ev=>{
        //console.log('page',ev);
        let ts=ev.eventSource.tileSources[ev.page];
        if(!ts.ready){
            let fr = new FileReader();
            fr.readAsDataURL(v1.tileSources[ev.page].file);
            fr.onload = () => ts.getImageInfo(fr.result);
        }
        
        let tk = new AnnotationToolkit(v1);
        tk.addOnceHandler('before-destroy',(ev)=>{
            ts.annotationStore = tk.toGeoJSON();
        })
        let ui=tk.addAnnotationUI({
            autoOpen:true,
            addLayerDialog:false,

        });
        ui._layerUI.element.appendTo($('#gui-container')).on('element-added',(ev)=>{
            let scrollToElement = $(ev.target);
            scrollToElement && setTimeout(()=>{
                //scrolltoelement[0].scrollIntoView(false)
                scrollToElement[0].scrollIntoView({block: "nearest", inline: "nearest"})
            }, 0);
        });
        ui._layerUI.element.find('input.annotation-fill-opacity').val('0.5').trigger('input');
        
        let json = ts.annotationStore || styledef;
        tk.addFeatureCollections(json);

        $('#current-file').text(`${ts.file.name} (${ev.page+1} of ${ev.eventSource.tileSources.length})`)

        // viewer.viewport.setRotation(30)
        // window.view = tk.overlay.paperScope.view;
        // window.project = tk.overlay.paperScope.project;
        // window.view.onClick = (ev)=>console.log('view click',ev.point);
        // window.ts = ts;
    })
    return viewer;
}
