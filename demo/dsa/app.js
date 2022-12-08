
import { AnnotationToolkit } from '../../js/annotationtoolkit.js';
let styledef;
// $.get('./init.geoJSON').then(x=>{
//     styledef=x;
// })
$('.dsa-link').val('https://localhost:3001/dsa');
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
$('#dsa-dialog').dialog({
    autoOpen:false,
    minWidth:760,
});
$('.dsa-link').on('keypress',ev=>{
    if(ev.key=='Enter') $('#dsa-go').trigger('click');
})
$('#dsa-go').on('click',()=>{
    let baseurl = $('.dsa-link').val().trim().replace(/api\/v1\/?.*/,'').replace(/\/*$/, '');
    if(baseurl !== $('#dsa-dialog').data('baseurl')){
        setupDSA(baseurl);
        $('#dsa-dialog').data('baseurl',baseurl);
    }
    $('#dsa-dialog').dialog('open');
})

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

// $('#get-results').on('click',function(){
//     //get current annotations
//     if(!v1.annotationToolkit) return;
//     v1.tileSources[v1.currentPage()].annotationStore = v1.annotationToolkit.getGeoJSONObjects();
//     let zip = new JSZip();
//     let files=v1.tileSources.filter(ts=>ts.annotationStore).map(ts=>{
//         let p = new paper.PaperScope();
//         p.setup();
//         let background = new paper.Path.Rectangle(new paper.Point(0,0), new paper.Size(ts.width, ts.height));
//         background.fillColor = 'black';
//         p.project.activeLayer.addChild(background);
//         ts.annotationStore.forEach(fc=>{
//             fc.features.forEach(f=>{
//                 let item = paper.Item.fromGeoJSON(f);
//                 if(!item.intersect){
//                     item.remove();
//                     return;
//                 }
//                 let toAdd = item.intersect(background);
//                 toAdd.strokeWidth = 0;
//                 toAdd.fillColor = 'white';
//                 p.project.activeLayer.addChild(toAdd);
//                 item.remove();
//             })
//         })
        
//         let gjname = ts.file.name+'.geoJSON';
//         let geoJSON = JSON.stringify(ts.annotationStore);
        

//         let rastername=ts.file.name+'.mask.png';
//         let raster=p.project.activeLayer.scale(1/p.view.pixelRatio).rasterize({insert:false});
//         let dataurl = raster.toDataURL();
//         return fetch(dataurl).then(res => res.blob()).then(blob => {
//             zip.file(rastername, blob);
//             zip.file(gjname, geoJSON);
//         });

//     });
//     Promise.all(files).then(()=>zip.generateAsync({type:'blob'}).then(blob=>saveAs(blob, "sugarbug.zip")) );
// })

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
        if(!ts.ready && ts.file && ts.file.constructor === File){
            let fr = new FileReader();
            fr.readAsDataURL(v1.tileSources[ev.page].file);
            fr.onload = () => ts.getImageInfo(fr.result);
        }
        
        let tk = new AnnotationToolkit(v1);
        tk.addOnceHandler('before-destroy',(ev)=>{
            // console.log('before-destroy',this);
            ts.annotationStore = tk.getGeoJSONObjects();
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
        
        let json = ts.annotationStore;
        if(json){
            tk.addFeatureCollections(json);
        } else {
            ts.getAnnotations && ts.getAnnotations().then(a=>{
                console.log('Annotation info',a);
                tk.addFeatureCollections(a);
            });
        }
        

        $('#current-file').text(`${ts.file.name} (${ev.page+1} of ${ev.eventSource.tileSources.length})`)

        // viewer.viewport.setRotation(30)
        // window.view = tk.overlay.paperScope.view;
        // window.project = tk.overlay.paperScope.project;
        // window.view.onClick = (ev)=>console.log('view click',ev.point);
        // window.ts = ts;
    })
    return viewer;
}
function setupDSA(baseurl){
    // $('#dsa-dialog .dsa-contents').text('Hello, world! BaseURL = '+baseurl);
    
    let API = new DigitalSlideArchiveAPI(baseurl);
    $('#dsa-dialog').dialog('option','title','DSA: '+baseurl).data('API',API);
    // console.log(API);
    let loginScreen=API.LoginSystem.getLoginScreen();
    loginScreen.on('logged-in',getCollections);
    $('#dsa-dialog .login').html(loginScreen);
    $('#dsa-dialog .dsa-contents').html('Loading...')
    API.LoginSystem.autologin();
    getAnnotatedImages();
    getCollections();
    return API;
}
function getAnnotatedImages(){
    console.log('getAnnotatedImages');
    let API = $('#dsa-dialog').data('API');
    API.get('annotation/images').then(d=>{
        let element=$('<div>',{class:'folder'});
        $('#dsa-dialog .dsa-annotated-images').empty().append(element);
        let header=$('<div>',{class:'folder-header'}).text(`${d.length} images with annotations`).appendTo(element);
        header.prepend($('<span>',{class:'fa fa-folder'})).prepend($('<span>',{class:'fa fa-folder-open'}));
        let contents=$('<div>',{class:'folder-contents'}).appendTo(element).hide();
        let items=d.map(item=>{
            let element = $('<div>',{class:'item'}).text(item.name).data('item',item);
            element.on('click',()=>{
                console.log('Item clicked',item);
                API.get(`item/${item._id}/tiles`).then(d=>openDSATileSource(API, item, d));
            })
            return element;
        });
        contents.append(items);

        header.on('click',()=>{
            contents.toggle();
            if(contents.is(':visible')){
                element.addClass('expanded');
            } else {
                element.removeClass('expanded');
            }
        })
    })

    
}
function getCollections(){
    console.log('getCollections');
    let API = $('#dsa-dialog').data('API');
    API.get('collection',{params:{limit:0}}).then(d=>{
        // console.log('collection result',d);
        let contents=$('#dsa-dialog .dsa-collections').empty();
        let collections = d.map(collection=>{
            let element=$('<div>',{class:'collection folder'});
            let header=$('<div>',{class:'folder-header'}).text(collection.name).data('collection',collection).appendTo(element);
            header.prepend($('<span>',{class:'fa fa-folder'})).prepend($('<span>',{class:'fa fa-folder-open'}));
            let contents=$('<div>',{class:'folder-contents'}).appendTo(element).hide();
            header.on('click',()=>{
                contents.toggle();
                if(contents.is(':visible')){
                    element.addClass('expanded');
                    getFolders(collection).then(folders=>contents.html(folders));
                } else {
                    element.removeClass('expanded');
                }
            })
            return element;
        });
        contents.append(collections);
    })
}
function getFolders(parent){
    let API = $('#dsa-dialog').data('API');
    
    return API.get('folder',{params:{parentType:parent._modelType,parentId:parent._id}}).then(d=>{
        // console.log('folders',d);
        let folders = d.map(folder=>{
            let element=$('<div>',{class:'folder'});
            let header=$('<div>',{class:'folder-header'}).text(folder.name).data('folder',folder).appendTo(element);
            header.prepend($('<span>',{class:'fa fa-folder'})).prepend($('<span>',{class:'fa fa-folder-open'}));
            let contents=$('<div>',{class:'folder-contents'}).appendTo(element).hide();
            header.on('click',()=>{
                contents.toggle();
                if(contents.is(':visible')){
                    element.addClass('expanded');
                    contents.empty();
                    getFolders(folder).then(folders=>contents.append(folders));
                    getItems(folder).then(items=>contents.append(items));
                } else {
                    element.removeClass('expanded');
                }
            })
            return element;
        })
        return folders;
    });
}
function getItems(folder){
    let API = $('#dsa-dialog').data('API');
    return API.get('item',{params:{folderId:folder._id}}).then(d=>{
        // console.log('items',d);
        return d.map(item=>{
            let element = $('<div>',{class:'item'}).text(item.name).data('item',item);
            element.on('click',()=>{
                console.log('Item clicked',item);
                API.get(`item/${item._id}/tiles`).then(d=>openDSATileSource(API, item, d));
            })
            return element;
        })
    });
}

function openDSATileSource(API, item, tileInfo){
    let baseURL = API.url('',{});
    let tileSource= {
        height: tileInfo.sizeY,
        width: tileInfo.sizeX,
        tileWidth: tileInfo.tileWidth,
        tileHeight: tileInfo.tileHeight,
        minLevel: 0,
        maxLevel: tileInfo.levels - 1,
        getTileUrl: function (level, x, y) {
            return baseURL + `item/${item._id}/tiles/zxy/${level}/${x}/${y}`;
            // return baseurl + '/api/v1/item/' + itemId + '/tiles/zxy/' + level + '/' + x + '/' + y;
        },
        ajaxWithCredentials: true,
        file:{
            name:item.name,
        },
        getAnnotations:function(){
            return API.get('annotation',{params:{itemId:item._id}}).then(d=>{
                let promises=d.map(annotation=>{
                    return API.get(`annotation/${annotation._id}`).then(d=>DSAAnnotationToGeoJSONFeatureCollection(d));
                });
                return Promise.all(promises);
            });
        }
    };
    v1.open([tileSource]);
    v1.goToPage(0);
}