
import { AnnotationToolkit } from '../../js/annotationtoolkit.js';
let styledef;
let examples;
$(window).on('beforeunload',function(){
    return 'Are you sure you want to leave?';
})
$.get('./init.geoJSON').then(x=>{
    styledef=x;
});
$.get('./Examples.json').then(x=>{
    examples=x;
});
let defaultDSA = window.location.hash||'';
$('.dsa-link').val(defaultDSA);
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
    if(!baseurl.match(/http/)){
        baseurl = 'https://'+baseurl;
        $('.dsa-link').val(baseurl);
    }
    if(baseurl !== $('#dsa-dialog').data('baseurl')){
        setupDSA(baseurl);
        $('#dsa-dialog').data('baseurl',baseurl);
    }
    $('#dsa-dialog').dialog('open');
})

$('#file-picker').on('change',function(){
   let tileSources = Array.from(this.files).map(imageTileSource);
    v1.open(tileSources);
    v1.goToPage(0);
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
        showNavigator:true,
        // constrainDuringPan:true,
    });
    
    viewer.addHandler('page',ev=>{
        //console.log('page',ev);
        let API = $('#dsa-dialog').data('API');
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
        
        let json = ts.annotationStore || styledef;
        if(ts.getAnnotations) {
            ts.getAnnotations().then(a=>{
                console.log('Annotation info',a);
                tk.addFeatureCollections(a);
                $('#current-file').append($('<button>').text('Save to DSA').on('click',function(){
                    let geoJSON = tk.getGeoJSONObjects();
                    // console.log('Saving',geoJSON);
                    let itemId = ts.item._id;
                    let API = $('#dsa-dialog').data('API');
                    let promises=geoJSON.map(d=>{
                        let dsaAnnotation = GeoJSONFeatureCollectionToDSAAnnotation(d);
                        let userdata  = d.properties.userdata || {};
                        let dsainfo = userdata.dsa || {};
                        let annotationId = dsainfo.annotationId;
                        let promise;
                        if(annotationId){
                            //use PUT to update the annotation 
                            promise = API.put(`annotation/${annotationId}`,{params:{itemId:itemId},data:dsaAnnotation});
                        } else {
                            //use POST to create a new annotation
                            promise = API.post('annotation',{params:{itemId:itemId},data:dsaAnnotation});
                        }

                        return promise.then(()=>{
                            console.log('Save succeeded');
                            alert('Save succeeded');
                        }).catch(result=>{
                            console.error(result.message);
                            alert(result.message);
                        })
                    });
                    // console.log(geoJSON,promises)
                }))
            });
        } else {
            tk.addFeatureCollections(json);
        }
        

        $('#current-file').text(`${ts.name} (${ev.page+1} of ${ev.eventSource.tileSources.length})`)

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
                API.get(`item/${item._id}/tiles`).then(d=>openDSASource(API, item, d));
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
                    contents.empty().append($('<span>',{class:'loading'}));
                    let folders = getFolders(folder).then(folders=>contents.append(folders));
                    let items = getItems(folder).then(items=>contents.append(items));
                    Promise.all([folders, items]).then(()=>{
                        contents.find('.loading').remove();
                        console.log('Folder resolved',element,contents);
                    })
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
        let promises = d.map(item=>{
            return API.get(`item/${item._id}/tiles`).then(d=>{
                let element = $('<div>',{class:'item'}).text(item.name).data('item',item);
                element.on('click',()=>{
                    console.log('Item clicked',item);
                    openDSASource(API, item, d);
                })
                return element;
            }).catch(e=>{
                // console.log('Item not a tilesource',item)
                return API.get(`item/${item._id}/files`).then(files=>{
                    let images = files.filter(file=>file.mimeType.startsWith('image'));
                    let elements=images.map(image=>{
                        let element = $('<div>',{class:'item'}).text(item.name).data('item',item);
                        element.on('click',()=>{
                            console.log('Item clicked',item);
                            openDSASource(API, item, image);
                        })
                        return element;
                    });
                    return $(elements).map($.fn.toArray);
                });
            });
        });

        return Promise.all(promises);
    });
}

function openDSASource(API, item, fileInfo){
    let baseURL = API.url('',{});
    let token = API.gettoken();
    let tileSource= fileInfo.tileWidth ? pyramidalTileSource(baseURL, fileInfo, item._id,token) : dsaImageTileSource(baseURL, item._id,token);

    tileSource.getAnnotations =function(){
        return API.get('annotation',{params:{itemId:item._id}}).then(d=>{
            let promises=d.map(annotation=>{
                return API.get(`annotation/${annotation._id}`).then(d=>DSAAnnotationToGeoJSONFeatureCollection(d));
            });
            return Promise.all(promises);
        });
    }
    tileSource.ajaxWithCredentials = true;
    tileSource.name = item.name;
    tileSource.item = item;
    
    v1.open([tileSource]);
    v1.goToPage(0);
    $('#dsa-dialog').dialog('close');
}

function pyramidalTileSource(baseURL, tileInfo, itemId, token){
    return {
        height: tileInfo.sizeY,
        width: tileInfo.sizeX,
        tileWidth: tileInfo.tileWidth,
        tileHeight: tileInfo.tileHeight,
        minLevel: 0,
        maxLevel: tileInfo.levels - 1,
        getTileUrl: function (level, x, y) {
            return baseURL + `item/${itemId}/tiles/zxy/${level}/${x}/${y}?token=${token}`;
        },
    }
}

function dsaImageTileSource(baseURL, itemId, token){
    return new OpenSeadragon.ImageTileSource({
        url: `${baseURL}item/${itemId}/download?contentDispositon=inline&token=${token}`,
        ajaxWithCredentials:true,
        crossOriginPolicy:'Anonymous',
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