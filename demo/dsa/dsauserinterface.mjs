import { DigitalSlideArchiveAPI } from "./dsa.mjs";
import { DSAAdapter } from "./adapter.mjs";

export class DSAUserInterface extends OpenSeadragon.EventSource{
    constructor(viewer, options){
        super();

        let defaultOptions = {
            hash: true,
        }

        this.options = Object.assign(defaultOptions, options);

        this._viewer = viewer;
        this.API = null;
        this._currentItem = null;
        this._currentAnnotation = null;

        this.hashInfo = new HashInfo('dsa','image','bounds');
        
        // API for UI elements
        this.dialog = $(dialogHtml());
        this.header = $(headerHtml());
        this.annotationEditorGUI = $(annotationEditorHtml());
        this.dsaLinkInput = this.header.find('.dsa-link');
        this.dsaGoButton = this.header.find('.dsa-go');

        this.adapter = new DSAAdapter();

        this.annotationEditorGUI.hide();

        // initialize dialog instance
        this.dialog.dialog({
            autoOpen:false,
            minWidth:760,
        });

        // on pressing Enter in the input field, trigger the Go button
        this.dsaLinkInput.on('keypress',ev=>{
            if(ev.key=='Enter') this.dsaGoButton.trigger('click');
        });

        // on pressing Go, open the dialog, initializing the DSA connection if needed
        this.dsaGoButton.on('click',()=>{
            let baseurl = this.dsaLinkInput.val();
            let success = this.connectToDSA(baseurl);
            if(success){
                this.dialog.dialog('open');
            }
            
        });

        // on clicking the "New" annotation button, create a new annotation
        this.annotationEditorGUI.find('.dsa-new-annotation').on('click',()=>{
            let d = {
                annotation:{
                    elements:[]
                }
            };
            // let x = this.adapter.annotationToFeatureCollections(d);
            this._openAnnotation(d);
        })
        this.annotationEditorGUI.on('click','.annotation-item',(ev)=>{
            let element = $(ev.target);
            let annotation = element.data('annotation');
            this._openAnnotation(annotation);
        });
        this.annotationEditorGUI.on('click','.dsa-close-annotation',(ev)=>{
            this._closeAnnotation();
        });
        this.annotationEditorGUI.on('click','.dsa-save-annotation',(ev)=>{
            this._saveAnnotation();
        });
        this.annotationEditorGUI.on('click','.dsa-save-geojson',(ev)=>{
            this._saveAnnotationAsGeoJSON();
        });
        this.dialog.on('click','.item',(event)=>{
            let item = $(event.target).data('item');
            this.openItem(item._id, event.target);
            
        });


        // setup hash functionality, if enabled
        if(this.options.hash){
            // initialized based on hash
            this.hashInfo.read();
            if(this.hashInfo.dsa){
                let success = this.connectToDSA(this.hashInfo.dsa);
                if(success && this.hashInfo.image){
                    this.openItem(this.hashInfo.image).catch(e => {
                        this.addOnceHandler('login-returned', event=>{
                            if(event.success){
                                this.openItem(this.hashInfo.image);
                            } else {
                                alert('Could not open: image does not exist or you do not have permissions. Are you logged in?');
                                throw(`Could not open image with id=${this.hashInfo.image}`);
                            }

                        })
                    });
                }
            }

            this._viewer.addHandler('open',(event)=>{
                let ts = this._tileSource = event.source;
                // before updating hash with new ID, check to see if we should navigate using hash paramaters
                if(this.hashInfo.image === (ts.item && ts.item._id)){
                    if(this.hashInfo.bounds){
                        let bounds = this.hashInfo.bounds.split('%2C').map(b=>Number(b));
                        let rect = new OpenSeadragon.Rect(bounds[0], bounds[1], bounds[2] - bounds[0], bounds[3] - bounds[1]);
                        window.setTimeout(()=>viewer.viewport.fitBounds(viewer.viewport.imageToViewportRectangle(rect)));
                    }
                } else {
                    // add DSA ID as hash paramater via dsaUI
                    let imageId = ts.item && ts.item._id; 
                    if(imageId){
                        this.hashInfo.update({ image: imageId });
                    }
                }
            });

            // set up handler for view info (x, y, zoom) as hash parameter via dsaUI
            this._viewer.addHandler('animation-finish',ev=>{
                let source = this._tileSource;
                if(!source || !source.item || (source.item._id !== this.hashInfo.image)){
                    return;
                }
                let bounds = viewer.viewport.viewportToImageRectangle(viewer.viewport.getBounds(false));
                this.hashInfo.update({
                    bounds: [Math.round(bounds.x), Math.round(bounds.y), Math.round(bounds.x+bounds.width), Math.round(bounds.y+bounds.height)].join('%2C')
                });
            });
            
            this.addHandler('set-dsa-instance',event=>{
                this.hashInfo.update({dsa: event.url});
            });

            
        }
        

    }

    connectToDSA(baseurl){
        baseurl = baseurl.trim().replace(/api\/v1\/?.*/,'').replace(/\/*$/, '');
        if(baseurl.trim().length == 0){
            alert("A URL must be provided");
            return false;
        }
        if(!baseurl.match(/http/)){
            baseurl = 'https://'+baseurl;
        }
        this.dsaLinkInput.val(baseurl); //update the input to match what we have
        if(baseurl !== $('#dsa-dialog').data('baseurl')){
            this._setupDSA(baseurl);
            this.dialog.data('baseurl',baseurl);
            this.raiseEvent('set-dsa-instance',{url: baseurl});
        }
        return true;
    }
    
    openItem(id, element){
        return this.API.get(`item/${id}`, {noCache: true}).then(item=>{
            this._currentItem = item;
            this.API.get(`item/${id}/tiles`, {noCache: true}).catch(e=>{
                // console.log('Item not a tilesource',item)
                return this.API.get(`item/${item._id}/files`, {noCache: true});
            }).then(d=>{
                let ts = this._createTileSource(item, d);
                this.raiseEvent('open-tile-source',{
                    tileSource: ts,
                });
                this._viewer.open([ts]);
                this._viewer.goToPage(0);
                this.annotationEditorGUI.show();
                this.annotationEditorGUI.attr('data-mode','picker');
                this._setupItemNavigation(ts.name, element);
            });
        });
        
    }

    // private
    _setupItemNavigation(currentName, currentElement){
        this.header.find('.item-navigation .item').attr('disabled',true).off('click');
        this.header.find('.current-item').text(currentName);
        if(!currentElement){
            return;
        }
        
        let previous = $(currentElement).prev();
        let next = $(currentElement).next();
        if(previous.length > 0){
            this.header.find('.item-navigation .previous').attr('disabled',false).on('click',()=>previous.trigger('click'));
        }
        if(next.length > 0){
            this.header.find('.item-navigation .next').attr('disabled',false).on('click',()=>next.trigger('click'));
        }

    }

    // private
    _openAnnotation(annotation, element){
        this._currentAnnotation = annotation;
        this.annotationEditorGUI.attr('data-mode','current');
        this.annotationEditorGUI.find('input').val(annotation.annotation.name);
        this.annotationEditorGUI.find('textarea').val(annotation.annotation.description);

        this.API.get(`annotation/${annotation._id}`, {noCache: true})
            .then(d=>this.adapter.annotationToFeatureCollections(d))
            .then(d=>{
                this._viewer.annotationToolkit.addFeatureCollections(d, true);
                this.annotationEditorGUI.data({listitem: element});
                this.raiseEvent('annotation-opened',{annotation: annotation, featureCollections: d});       
            });
    }

    // private
    _saveAnnotation(){
        let annotation = this._currentAnnotation;
        let element = this.annotationEditorGUI.data('listitem');
        if(!element){
            element = $('<div>',{class:'annotation-item'}).appendTo(this.annotationEditorGUI.find('.dsa-annotation-list'));
        }
        annotation.annotation.name = this.annotationEditorGUI.find('input').val();
        annotation.annotation.description = this.annotationEditorGUI.find('textarea').val();

        // TO DO: make this work with using FeatureCollections as Groups
        
        let geoJSON = this._viewer.annotationToolkit.toGeoJSON();
        // console.log('Saving',geoJSON);
        let itemId = this._currentItem._id;
        annotation.annotation.elements = this.adapter.featureCollectionsToElements(geoJSON);
        console.log(annotation);

        let promise;
        if(annotation._id){
            //use PUT to update the annotation 
            promise = this.API.put(`annotation/${annotation._id}`,{params:{itemId:itemId},data:annotation.annotation});
        } else {
            //use POST to create a new annotation
            promise = this.API.post('annotation',{params:{itemId:itemId},data:annotation.annotation});
        }

        if(this.annotationEditorGUI.find('.save-geojson').prop('checked')){
            promise.then(d=>{
                console.log('Annotation saved',d);
                this._saveAnnotationAsGeoJSON(annotation.annotation.name, d._id, JSON.stringify(geoJSON));
            })
        }
       
    }

    // private
    _saveAnnotationAsGeoJSON(annotationName, annotationId, geoJSON){
        let idExtension = `.${annotationId}.json`;
        let name = `${annotationName}${idExtension}`;
        let blob = new Blob([geoJSON], {type:'application/json'});
        let params = {
            parentType:'item',
            parentId:this._currentItem._id,
            name:name,
        };
        // console.log('save as geojson', params);
        this.API.get(`item/${this._currentItem._id}/files`, {noCache: true}).then(d=>{
            console.log('files',d);
            let filtered = d.filter(f=>f.name.endsWith(idExtension) && f.mimeType == 'application/json');
            if(filtered.length > 0){
                // file already exists - modify the contents
                this.API.updateFile(filtered[0], blob).then(d=>{
                    console.log('Changes saved', d);
                });
            } else {
                // upload a new file to this item
                this.API.uploadFile(blob, params).then(d=>{
                    console.log('File uploaded', d)
                })
            }
            // item with this name already exists. Replace contents with new file.

        });
        // 
    }

    // private
    _closeAnnotation(){
        this._viewer.annotationToolkit.close();
        this._currentAnnotation = null;
        this.annotationEditorGUI.attr('data-mode','picker');
        this.raiseEvent('annotation-closed');
    }

    // private
    _setupDSA(baseurl){
        
        this.API = new DigitalSlideArchiveAPI(baseurl);
        this.API.get('system/check?mode=basic').catch(e=>{
            this.API = null;
            throw('Either this URL is not a DSA, or the DSA cannot be reached (check CORS settings).');
        }).then(d=>{
            this.dialog.dialog('option', 'title', 'DSA: '+baseurl); 
            
            let loginScreen=this.API.LoginSystem.getLoginScreen();
            loginScreen.on('logged-in',()=>{
                this._getAnnotatedImages();
                this._getCollections();
                this.raiseEvent('logged-in');
            });
            loginScreen.on('login-returned',(_,event)=>{
                this.raiseEvent('login-returned',{success: event.success});
            })
            this.dialog.find('.login').html(loginScreen);
            this.dialog.find('.dsa-contents').html('Loading...')
            this.API.LoginSystem.autologin();
            this._getAnnotatedImages();
            this._getCollections();

            this.raiseEvent('dsa-connected');
        })
        
    }

    // private
    _getAnnotatedImages(){
        this.API.get('annotation/images',{params:{limit:10}}, {noCache: true}).then(d=>{
            let element=$('<div>',{class:'folder'});
            this.dialog.find('.dsa-annotated-images').empty().append(element);
            let header=$('<div>',{class:'folder-header'}).text(`${d.length} images with annotations`).appendTo(element);
            header.prepend($('<span>',{class:'fa fa-folder'})).prepend($('<span>',{class:'fa fa-folder-open'}));
            let contentsContainer=$('<div>',{class:'folder-contents'}).appendTo(element).hide();
            this._makeItemList(contentsContainer, d);
    
            header.on('click',()=>{
                contentsContainer.toggle();
                if(contentsContainer.is(':visible')){
                    element.addClass('expanded');
                } else {
                    element.removeClass('expanded');
                }
            })
        })
    }

    // private
    _makeItemList(container, itemList){
        let items=itemList.map(item=>{
            return $('<div>',{class:'item'}).text(item.name).data('item',item);
        });
        container.append(items);
    }   

    // private
    _getCollections(){
        this.API.get('collection',{params:{limit:0}, noCache: true}).then(d=>{
            
            let contents=this.dialog.find('.dsa-collections').empty();
            let collections = d.map(collection=>{
                let element=$('<div>',{class:'collection folder'});
                let header=$('<div>',{class:'folder-header'}).text(collection.name).data('collection',collection).appendTo(element);
                header.prepend($('<span>',{class:'fa fa-folder'})).prepend($('<span>',{class:'fa fa-folder-open'}));
                let contents=$('<div>',{class:'folder-contents'}).appendTo(element).hide();
                header.on('click',()=>{
                    contents.toggle();
                    if(contents.is(':visible')){
                        element.addClass('expanded');
                        this._getFolders(collection).then(folders=>contents.html(folders));
                    } else {
                        element.removeClass('expanded');
                    }
                })
                return element;
            });
            contents.append(collections);
        })
    }

    // private
    _getFolders(parent){
        
        return this.API.get('folder',{params:{parentType:parent._modelType,parentId:parent._id,limit:0}, noCache: true}).then(d=>{
            
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
                        let folders = this._getFolders(folder).then(folders=>contents.append(folders));
                        let items = this._getItems(folder, contents);
                        Promise.all([folders, items]).then(()=>{
                            contents.find('.loading').remove();
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

    // private
    _getItems(folder, container){
        // let _this = this;
        return this.API.get('item',{params:{folderId:folder._id,limit:0}, noCache: true}).then(d=>{
            return this._makeItemList(container, d);
        });
    }

    // private
    _createTileSource(item, fileInfo){
        let baseURL = this.API.url('',{});
        let token = this.API.gettoken();
        let tileSource= fileInfo.tileWidth ? pyramidalTileSource(baseURL, fileInfo, item._id, token) : dsaImageTileSource(baseURL, item._id, token);
        let listElement = this.annotationEditorGUI.find('.dsa-annotation-list').empty();
        this.API.get('annotation',{params:{itemId:item._id}, noCache: true}).then(d=>{
            let elements = d.map(annotation=>{
                return $('<div>',{class:'annotation-item'}).text(annotation.annotation.name).data('annotation',annotation);
            })
            
            
            listElement.append(elements);
        });

        tileSource.ajaxWithCredentials = true;
        tileSource.name = item.name;
        tileSource.item = item;
        tileSource.item.detail = fileInfo;
        return tileSource;
    }
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

class HashInfo{
    constructor(){
        this.hashInfo = this._initHashInfo(Array.from(arguments));
        this.hashKeys = Object.keys(this.hashInfo);
    }
    
    // has-based state saving - add image ID and navigation parameters to the URL
    read(){
        let hash = window.location.hash;
        if(!hash){
            return;
        }
        hash = hash.substring(1);
        let pairs = hash.split('&');
        pairs.forEach(pair=>{
            let array = pair.split('=');
            if(array.length === 2 && this.hashKeys.includes(array[0])){
                this.hashInfo[array[0]]=array[1];
            }
        });
    }
    update(options){
        for (const [key, value] of Object.entries(options)) {
            if(this.hashInfo.hasOwnProperty(key)){
                this.hashInfo[key] = value;
            } else {
                console.error(`Bad hash option: ${key} not allowed as a key.`);
            }
        }

        let newHash = this.hashKeys.filter(key=>this.hashInfo[key] !== null).map(key=>{
            return key + '=' + this.hashInfo[key];
        }).join('&');

        window.location.hash = newHash;
    }

    _initHashInfo(fields){
        let hashInfo = fields.reduce((accumulator, field)=>{
            accumulator[field] = null;
            Object.defineProperty(this,field,{
                get: function(){ return this.hashInfo[field]; }
            });
            return accumulator;
        }, {});
        return hashInfo;
    }

}



function dialogHtml(){
    return `
    <div class="dsa-dialog dsaui">
        <div class="login"></div>
        <h3>Recently annotated images (up to 10)</h3>
        <div class="dsa-contents dsa-annotated-images"></div>
        <h3>Collections</h3>
        <div class="dsa-contents dsa-collections"></div>
    </div>
    `;
}
function headerHtml(){
    return `
    <div class="dsa-header dsaui">
        <input type="text" placeholder="Paste link to a DSA instance" class="dsa-link"><button class="dsa-go">Open DSA</button>
        <span class="item-navigation"> 
            Now annotating: <span class="current-item"></span>
            <button class="item previous" disabled><</button>
            <button class='item next' disabled>></button>
        </span>
    </div>
    `;
}
function annotationEditorHtml(){
    return `
    <div class="dsa-annotation-gui dsaui" data-mode="picker">
        <div class="dsa-annotation-picker">
            <div class="dsa-annotation-list"></div>
            <button class="dsa-new-annotation">Create New</button>
        </div>
        <div class="dsa-current-annotation">
            <div><input type="text" placeholder="Enter annotation name"><button class="dsa-close-annotation">Close</button></div>
            <div><textarea placeholder="Enter annotation description"></textarea></div>
            <button class="dsa-save-annotation">Save</button>
            <!--<button class="dsa-save-geojson" title="Save this annotation as a GeoJSON file in the DSA">As GeoJSON</button>-->
            <input type="checkbox" class="save-geojson"> <label>with GeoJSON file</label>
        </div>
    </div>
    `;
}
