/**
 * OpenSeadragon paperjs overlay plugin based on paper.js
 * @version 0.3.0
 * 
 * Includes additional open source libraries which are subject to copyright notices
 * as indicated accompanying those segments of code.
 * 
 * Original code:
 * Copyright (c) 2022-2024, Thomas Pearce
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 * 
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 * 
 * * Neither the name of osd-paperjs-annotation nor the names of its
 *   contributors may be used to endorse or promote products derived from
 *   this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * 
 */


import { EditableContent } from "./utils/editablecontent.mjs";
/**
 * The FileDialog class provides options for saving and loading feature collections as GeoJSON, exporting them as SVG or PNG files,
 * and storing them in local storage. It is designed to work with the AnnotationToolKit (atk) object to manage annotations.
 *
 * @class
 * @memberof OSDPaperjsAnnotation
 */
class FileDialog{

    /**
     * Creates an instance of the FileDialog class, which allows users to save and load feature collections in various formats.
     *
     * @constructor
     * @memberof OSDPaperjsAnnotation.FileDialog
     * @param {any} atk - The AnnotationToolKit object.
     * @param {object} opts - Additional options for the file dialog.
     */
    constructor(atk, opts){
        let _this=this;
        this.element = $(fileDialogHtml()).appendTo('body');
        this.element.dialog({closeOnEscape:false,autoOpen:false,modal:false,open:initDlg,width:'auto','appendTo':opts.appendTo});
        // this.dialog = function(...args){ this.element.dialog(...args) }

        this.element.find('button[data-action="geojson-load"]').on('click',loadGeoJSON)
        this.element.find('button[data-action="geojson-save"]').on('click',saveGeoJSON)
        this.element.find('button[data-action="svg-export"]').on('click',exportSVG)
        this.element.find('button[data-action="png-export"]').on('click',exportPNG)
        this.element.find('button[data-action="ls-store"]').on('click',localstorageStore)
        this.element.find('button[data-action="ls-load"]').on('click',localstorageLoad)

        function getFileName(){
            return atk.viewer.world.getItemAt(0) ? atk.viewer.world.getItemAt(0).source.name : '';
        }
        function initDlg(){
            _this.element.find('.featurecollection-list').empty();
            _this.element.find('.finalize').empty();
        }
        /**
         * Sets up the feature collection list in the dialog. This function populates the file dialog with a list of available feature collections.
         *
         * @private
         * @param {Array} fcarray - An array of feature collections.
         * @returns {jQuery} The feature collection list element.
         */
        function setupFeatureCollectionList(fcarray){
            let list = _this.element.find('.featurecollection-list').empty();
            let els = fcarray.map(function(fc){
                let label = fc.label || fc.displayName; //handle geoJSON objects or paper.Layers
                let d = $('<div>');
                $('<input>',{type:'checkbox',checked:true}).appendTo(d).data('fc',fc);
                $('<label>').text(label).appendTo(d);
                return d;
            });
            list.append(els);
            return list;
        }
        /**
         * Loads a GeoJSON file and displays its content in the file dialog. This function triggers the file input and loads the GeoJSON file selected by the user.
         * It then parses the GeoJSON data, sets up the feature collection list, and provides options to add or replace existing layers.
         *
         * @private
         */
        function loadGeoJSON(){
            initDlg();
            let finput = $('<input>',{type:'file',accept:'text/geojson,.geojson,text/json,.json'});
            finput.on('change',function(){
                // console.log('File picked',this.files[0]);
                let file = this.files[0];
                let fr = new FileReader();
                let geoJSON=[];
                fr.onload=function(){
                    try{
                        geoJSON = JSON.parse(this.result);
                    }catch(e){
                        alert('Bad file - JSON could not be parsed');
                        return;
                    }
                    if(!Array.isArray(geoJSON)) geoJSON = [geoJSON];
                    let type = Array.from(new Set(geoJSON.map(e=>e.type)))
                    if(type.length==0){
                        _this.element.find('.featurecollection-list').text('Bad file - no Features or FeatureCollections were found')
                    }
                    if(type.length > 1){
                        alert('Bad file - valid geoJSON consists of an array of objects with single type (FeatureCollection or Feature)');
                        return;
                    }
                    //type.length==1
                    //convert list of features into a featurecolletion
                    if(type[0]=='Feature'){
                        let fc = [{
                            type:'FeatureCollection',
                            features:geoJSON,
                            properties:{
                                label:file.name
                            }
                        }];
                        geoJSON = fc;
                    }
                    setupFeatureCollectionList(geoJSON);
                    let replace = $('<button>').appendTo(_this.element.find('.finalize')).text('Replace existing layers');
                    replace.on('click',function(){ atk.addFeatureCollections(geoJSON,true); });
                    let add = $('<button>').appendTo(_this.element.find('.finalize')).text('Add new layers');
                    add.on('click',function(){ atk.addFeatureCollections(geoJSON,false); });
                }
                fr.readAsText(file);
            })
            finput.trigger('click');
        }
        /**
         * Loads the feature collections from local storage and displays them in the file dialog. This function retrieves the feature collections stored in local storage
         * and sets up the feature collection list in the file dialog, providing options to add or replace existing layers.
         *
         * @private
         */
        function localstorageLoad(){
            initDlg();
            let geoJSON=[];
            let filename=getFileName();
            let lskeys=Object.keys(window.localStorage);
            let list = _this.element.find('.featurecollection-list').empty();
            let div=$('<div>',{class:'localstorage-key-list'}).appendTo(list);
            let items=lskeys.sort((a,b)=>a.localeCompare(b)).map(key=>$('<div>',{class:'localstorage-key',style:`order: ${key==filename?0:1}`}).text(key));
            div.append(items);
            $(list).find('.localstorage-key').on('click',function(){
                let lsdata = window.localStorage.getItem($(this).text());
                if(!lsdata){
                    alert(`No data found in local storage for key=${$(this).text()}`);
                    return;
                }
                try{
                    geoJSON = JSON.parse(lsdata);
                }catch(e){
                    alert('Bad data - JSON could not be parsed');
                    return;
                }
                setupFeatureCollectionList(geoJSON);
                let replace = $('<button>').appendTo(_this.element.find('.finalize')).text('Replace existing layers');
                replace.on('click',function(){ atk.addFeatureCollections(geoJSON, true); });
                let add = $('<button>').appendTo(_this.element.find('.finalize')).text('Add new layers');
                add.on('click',function(){ atk.addFeatureCollections(geoJSON, false); });
            })
            
            
        }
        /**
         * Saves the feature collections as a GeoJSON file and provides a download link. This function prepares the selected feature collections in GeoJSON format,
         * creates a Blob, and generates a download link for the user to save the file.
         *
         * @private
         */
        function saveGeoJSON(){
            initDlg();
            let fcs = atk.toGeoJSON();
            let list = setupFeatureCollectionList(fcs);
            let finishbutton = setupFinalize('Create file','Choose file name:',getFileName()+'-FeatureCollections.json');
            finishbutton.on('click',function(){
                $(this).parent().find('.download-link').remove();
                
                let toSave=list.find('input:checked').toArray().map(function(cb){return $(cb).data('fc')});
                let txt = JSON.stringify(toSave);
                let blob = new Blob([txt],{type:'text/json'});
                let filename=$(this).data('label'); 
                let dl = $('<div>',{class:'download-link'}).insertAfter(this);
                $('<a>',{href:window.URL.createObjectURL(blob),download:filename,target:'_blank'}).appendTo(dl).text('Download file');
            })
        }
        /**
         * Exports the feature collections as an SVG file and provides a download link. This function prepares the selected feature collections and exports them as an SVG file.
         * It generates a download link for the user to save the file in SVG format.
         *
         * @private
         */      
        function exportSVG(){
            initDlg();
            let fcs = atk.toGeoJSON();
            let list = setupFeatureCollectionList(fcs);
            let finishbutton = setupFinalize('Create file','Choose file name:',getFileName()+'-FeatureCollections.svg');
            finishbutton.on('click',function(){
                $(this).parent().find('.download-link').remove();
                let toSave=list.find('input:checked').toArray().map(function(cb){return $(cb).data('fc')});
                if(toSave.length>0){
                    let p = new paper.PaperScope();
                    p.setup();
                    toSave.forEach(function(s){
                        p.project.addLayer(s.layer.clone({insert:false,deep:true}));
                    })
                    let blob = new Blob([p.project.exportSVG({asString:true,bounds:'content'})],{type:'text/svg'});
                    let filename=$(this).data('label');
                    let dl = $('<div>',{class:'download-link'}).insertAfter(this);
                    $('<a>',{href:window.URL.createObjectURL(blob),download:filename,target:'_blank'}).appendTo(dl).text('Download file');
                }
            })
        }
        /**
         * Exports the feature collections as a PNG file and provides a download link. This function prepares the selected feature collections and exports them as a rasterized PNG file.
         * It generates a download link for the user to save the file in PNG format.
         *
         * @private
         */
        function exportPNG(){
            initDlg();
            let fcs = atk.getFeatureCollectionGroups();
            let list = setupFeatureCollectionList(fcs);
            let finishbutton = setupFinalize('Create file','Choose file name:',getFileName()+'-raster.png');
            finishbutton.on('click',function(){
                $(this).parent().find('.download-link').remove();
                let toSave=list.find('input:checked').toArray().map(function(cb){return $(cb).data('fc')});
                if(toSave.length>0){
                    let p = new paper.PaperScope();
                    p.setup();
                    toSave.forEach(function(s){
                        p.project.activeLayer.addChildren(s.layer.clone({insert:false,deep:true}).children);
                    })
                    // let blob = new Blob([p.project.activeLayer.rasterize({insert:false}).toDataURL()],{type:'image/png'});
                    let filename=$(this).data(label);
                    let dl = $('<div>',{class:'download-link'}).insertAfter(this);
                    $('<a>',{href:p.project.activeLayer.rasterize({insert:false}).toDataURL(),download:filename,target:'_blank'}).appendTo(dl).text('Download file');
                }
            })
        }
        /**
         * Stores the feature collections in the local storage.
         * @private 
         */        
        function localstorageStore(){
            initDlg();
            let fcs = atk.toGeoJSON();
            let list = setupFeatureCollectionList(fcs);
            let finishbutton=setupFinalize('Save data','Local storage key:',getFileName(),true)
            finishbutton.on('click',function(){
                let toSave=list.find('input:checked').toArray().map(function(cb){return $(cb).data('fc')});
                let txt = JSON.stringify(toSave);
                let filename=$(this).data('label');
                window.localStorage.setItem(filename,txt);
            })
        }
        /**
         * Sets up the finalize button for performing actions and handling local storage. This function configures the finalize button,
         * allowing users to specify a label or key and checks for local storage availability.
         * @private
         * @param {string} buttonText - The text to display on the button.
         * @param {string} editableLabel - The label for the editable content.
         * @param {string} editableContent - The initial content for the editable content.
         * @param {boolean} localstorage - Whether to test for local storage.
         * @returns {jQuery} The finish button element.
         */
        function setupFinalize(buttonText,editableLabel,editableContent,localstorage){
            function testLocalstorage(localstorage, text, div){
                if(localstorage) Object.keys(localStorage).includes(text) ? div.addClass('key-exists') : div.removeClass('key-exists');
            }
            let finalize=_this.element.find('.finalize');
            let finishbutton = $('<button>').text(buttonText);
            let ec;
            if(editableLabel){
                let div = $('<div>').appendTo(finalize);
                div.append($('<div>').text(editableLabel));
                ec = new EditableContent({initialContent:editableContent});
                div.append(ec.element);
                if(localstorage) div.addClass('localstorage-key-test');
                ec.onChanged= (text)=>{
                    finishbutton.data('label',text);
                    testLocalstorage(localstorage, text, div);
                }
                testLocalstorage(localstorage, editableContent, div);
            }
            finishbutton.appendTo(finalize).data({label:editableContent,ec:ec});
            return finishbutton;
        }
        /**
         * Returns the HTML for the file dialog. This function generates the HTML markup for the file dialog, including the buttons and feature collection list.
         * @private
         * @returns {string} The HTML for the file dialog.
         */
        function fileDialogHtml(){
            return `
                <div class="annotation-ui-filedialog" title="Save and Load Feature Collections">
                    <div class="file-actions">
                        <div class='header'>1. Available actions</div>
                        <button class='btn' data-action='geojson-load'>Load GeoJSON</button>
                        <button class='btn' data-action='ls-load'>Load from browser</button>
                        <hr>
                        <button class='btn' data-action='geojson-save'>Save GeoJSON</button>
                        <button class='btn' data-action='svg-export'>Export as SVG</button>
                        <button class='btn' data-action='png-export'>Rasterize to PNG</button>
                        <button class='btn' data-action='ls-store'>Store in browser</button>
                    </div>
                    <div class='featurecollection-selection'>
                        <div class='header'>2. Select Feature Collections</div>
                        <div class='featurecollection-list'></div>
                    </div>
                    <div class="finalize-panel">
                        <div class='header'>3. Finalize</div>
                        <div class='finalize'>
                        
                        </div>
                    </div>
                </div>`;
        }
    }
    /**
     * Shows the file dialog.
     */
    show(){
        this.element.dialog('open');
    }
    /**
     * Hides the file dialog.
     */
    hide(){
        this.element.dialog('close');
    }
    /**
     * Toggles the visibility of the file dialog.
     */
    toggle(){
        this.element.dialog('isOpen') ? this.element.dialog('close') : this.element.dialog('open');
    }
    /**
     * Calls a method on the dialog element.
     * @param {...any} args - The arguments to pass to the method.
     */
    dialog(...args){
        this.element.dialog(...args)
    }
}

export {FileDialog};