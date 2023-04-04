import { DigitalSlideArchiveAPI } from "./dsa.mjs";
import { DSAAdapter } from "./adapter.mjs";

export class DSAUserInterface extends OpenSeadragon.EventSource{
    constructor(viewer){
        super();
        this._viewer = viewer;
        this.API = null;
        this._currentItem = null;
        this._currentAnnotation = null;

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
        this.dialog.on('click','.item',(event)=>{
            let item = $(event.target).data('item');
            this.openItem(item._id);
            
        });

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
    
    openItem(id){
        return this.API.get(`item/${id}`).then(item=>{
            this._currentItem = item;
            this.API.get(`item/${id}/tiles`).catch(e=>{
                // console.log('Item not a tilesource',item)
                return this.API.get(`item/${item._id}/files`);
            }).then(d=>{
                let ts = this._createTileSource(item, d);
                this.raiseEvent('open-tile-source',{
                    tileSource: ts,
                });
                this._viewer.open([ts]);
                this._viewer.goToPage(0);
                this.annotationEditorGUI.show();
                this.annotationEditorGUI.attr('data-mode','picker');
            });
        });
        
    }

    // private
    _openAnnotation(annotation, element){
        this._currentAnnotation = annotation;
        this.annotationEditorGUI.attr('data-mode','current');
        this.annotationEditorGUI.find('input').val(annotation.annotation.name);
        this.annotationEditorGUI.find('textarea').val(annotation.annotation.description);

        this.API.get(`annotation/${annotation._id}`)
            .then(d=>this.adapter.annotationToFeatureCollections(d))
            .then(d=>{
                this._viewer.annotationToolkit.addFeatureCollections(d, true);
                this.annotationEditorGUI.data({listitem: element});
                this.raiseEvent('annotation-opened',{annotation: annotation});       
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

        if(annotation._id){
            //use PUT to update the annotation 
            this.API.put(`annotation/${annotation._id}`,{params:{itemId:itemId},data:annotation.annotation});
        } else {
            //use POST to create a new annotation
            this.API.post('annotation',{params:{itemId:itemId},data:annotation.annotation});
        }
       
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
        this.API.get('annotation/images').then(d=>{
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
        this.API.get('collection',{params:{limit:0}}).then(d=>{
            
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
        
        return this.API.get('folder',{params:{parentType:parent._modelType,parentId:parent._id}}).then(d=>{
            
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
        return this.API.get('item',{params:{folderId:folder._id}}).then(d=>{

            // let promises = d.map(item=>{
            //     return this.API.get(`item/${item._id}/tiles`).then(d=>{
            //         return item;
            //     }).catch(e=>{
            //         // console.log('Item not a tilesource',item)
            //         return this.API.get(`item/${item._id}/files`).then(d=>{
            //             return item;
            //         });
            //     });
            // });
    
            // return Promise.all(promises).then(itemList=>{
            //     this._makeItemList(container, itemList);
            // });
            return this._makeItemList(container, d);
        });
    }

    // private
    _createTileSource(item, fileInfo){
        let baseURL = this.API.url('',{});
        let token = this.API.gettoken();
        let tileSource= fileInfo.tileWidth ? pyramidalTileSource(baseURL, fileInfo, item._id, token) : dsaImageTileSource(baseURL, item._id, token);
        let listElement = this.annotationEditorGUI.find('.dsa-annotation-list').empty();
        this.API.get('annotation',{params:{itemId:item._id}}).then(d=>{
            let elements = d.map(annotation=>{
                return $('<div>',{class:'annotation-item'}).text(annotation.annotation.name).data('annotation',annotation);
            })
            
            
            listElement.append(elements);
        });

        tileSource.ajaxWithCredentials = true;
        tileSource.name = item.name;
        tileSource.item = item;
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



function dialogHtml(){
    return `
    <div class="dsa-dialog">
        <div class="login"></div>
        <h3>Annotated images</h3>
        <div class="dsa-contents dsa-annotated-images"></div>
        <h3>Collections</h3>
        <div class="dsa-contents dsa-collections"></div>
    </div>
    `;
}
function headerHtml(){
    return `
    <div class="dsa-header">
        <input type="text" placeholder="Paste link to a DSA instance" class="dsa-link"><button class="dsa-go">Open DSA</button>
    </div>
    `;
}
function annotationEditorHtml(){
    return `
    <div class="dsa-annotation-gui" data-mode="picker">
        <div class="dsa-annotation-picker">
            <div class="dsa-annotation-list"></div>
            <button class="dsa-new-annotation">Create New</button>
        </div>
        <div class="dsa-current-annotation">
            <div><input type="text" placeholder="Enter annotation name"></div>
            <div><textarea placeholder="Enter annotation description"></textarea></div>
            <button class="dsa-save-annotation">Save changes</button>
            <button class="dsa-close-annotation">Close</button>
        </div>
    </div>
    `;
}
