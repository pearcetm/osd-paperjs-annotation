import { EditableContent } from "./utils/editablecontent.mjs";
/**
 * Represents a file dialog for saving and loading feature collections.
 */
export class FileDialog{

    /**
     * Creates an instance of the FileDialog.
     *
     * @param {any} atk - The ATK object.
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
        /**
         * Gets the name of the currently displayed file.
         *
         * @returns {string} The file name.
         */
        function getFileName(){
            return atk.viewer.world.getItemAt(0) ? atk.viewer.world.getItemAt(0).source.name : '';
        }
        /**
         * Initializes the dialog by clearing the feature collection list and finalize section.
         */
        function initDlg(){
            _this.element.find('.featurecollection-list').empty();
            _this.element.find('.finalize').empty();
        }
        /**
         * Sets up the feature collection list in the dialog.
         *
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
         * Loads a GeoJSON file and sets up the feature collection list based on the loaded data.
         */
        function loadGeoJSON(){
            initDlg();
            /**
             * Represents a file input element for selecting GeoJSON files.
             *
             * @type {jQuery}
             */
            let finput = $('<input>',{type:'file',accept:'text/geojson,.geojson,text/json,.json'});
            finput.on('change',function(){
                /**
                 * The selected file.
                 *
                 * @type {File}
                 */            
            // console.log('File picked',this.files[0]);
                let file = this.files[0];
                /**
                 * Represents a FileReader object for reading file data.
                 *
                 * @type {FileReader}
                 */                
                let fr = new FileReader();
                /**
                 * The parsed GeoJSON data.
                 *
                 * @type {Array|Object}
                 */    
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
         * Loads the feature collections from the local storage.
         * @function
         * @memberof AtkMap
         * @param {Object} atk - The AtkMap object that contains the features.
         * @returns {void}
         */
        function localstorageLoad(atk){
            initDlg(); // Initialize the dialog box
            let geoJSON=[]; // An array to store the GeoJSON data
            let filename=getFileName(); // Get the file name from the AtkMap object
            let lskeys=Object.keys(window.localStorage); // Get the keys from the local storage
            let list = _this.element.find('.featurecollection-list').empty(); // Find and empty the feature collection list element
            let div=$('<div>',{class:'localstorage-key-list'}).appendTo(list); // Create a div element for the local storage key list and append it to the list element
            let items=lskeys.sort((a,b)=>a.localeCompare(b)).map(key=>$('<div>',{class:'localstorage-key',style:`order: ${key==filename?0:1}`}).text(key)); // Create an array of div elements for each local storage key, sorted by name and ordered by matching the file name
            div.append(items); // Append the items to the div element
            $(list).find('.localstorage-key').on('click',function(){ // Add a click event handler to each local storage key element
                let lsdata = window.localStorage.getItem($(this).text()); // Get the data from the local storage for the clicked key
                if(!lsdata){ // If no data is found
                    alert(`No data found in local storage for key=${$(this).text()}`); // Alert the user
                    return; // Return from the function
                }
                try{
                    geoJSON = JSON.parse(lsdata); // Try to parse the data as JSON and store it in the geoJSON array
                }catch(e){ // If an error occurs
                    alert('Bad data - JSON could not be parsed'); // Alert the user
                    return; // Return from the function
                }
                setupFeatureCollectionList(geoJSON); // Setup the feature collection list with the geoJSON data
                let replace = $('<button>').appendTo(_this.element.find('.finalize')).text('Replace existing layers'); // Create a button to replace the existing layers with the geoJSON data and append it to the finalize element
                replace.on('click',function(){ atk.addFeatureCollections(geoJSON, true); }); // Add a click event handler to the button that calls the addFeatureCollections method of the AtkMap object with true as the second argument
                let add = $('<button>').appendTo(_this.element.find('.finalize')).text('Add new layers'); // Create a button to add new layers with the geoJSON data and append it to the finalize element
                add.on('click',function(){ atk.addFeatureCollections(geoJSON, false); }); // Add a click event handler to the button that calls the addFeatureCollections method of the AtkMap object with false as the second argument
            })
            
            
        }

        /**
         * Saves the feature collections as a GeoJSON file.
         * @function
         * @memberof AtkMap
         */
        function saveGeoJSON(){
            initDlg(); // Initialize the dialog box
            let fcs = atk.toGeoJSON(); // Convert the features to GeoJSON format
            let list = setupFeatureCollectionList(fcs); // Create a list of feature collections
            let finishbutton = setupFinalize('Create file','Choose file name:',getFileName()+'-FeatureCollections.json'); // Create a button to finalize the file name
            finishbutton.on('click',function(){ // Add a click event handler to the button
                $(this).parent().find('.download-link').remove(); // Remove any existing download links
                
                let toSave=list.find('input:checked').toArray().map(function(cb){return $(cb).data('fc')}); // Get the selected feature collections
                let txt = JSON.stringify(toSave); // Convert them to JSON string
                let blob = new Blob([txt],{type:'text/json'}); // Create a blob object with the JSON string
                let filename=$(this).data('label');  // Get the file name from the button data
                let dl = $('<div>',{class:'download-link'}).insertAfter(this); // Create a div element for the download link
                $('<a>',{href:window.URL.createObjectURL(blob),download:filename,target:'_blank'}).appendTo(dl).text('Download file'); // Create an anchor element with the blob URL and append it to the div element
            })
        }

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
         * Exports the feature collections as a SVG file.
         * @function
         * @memberof AtkMap
         */
        function exportSVG(){
            initDlg(); // Initialize the dialog box
            let fcs = atk.toGeoJSON(); // Convert the features to GeoJSON format
            let list = setupFeatureCollectionList(fcs); // Create a list of feature collections
            let finishbutton = setupFinalize('Create file','Choose file name:',getFileName()+'-FeatureCollections.svg'); // Create a button to finalize the file name
            finishbutton.on('click',function(){ // Add a click event handler to the button
                $(this).parent().find('.download-link').remove(); // Remove any existing download links
                let toSave=list.find('input:checked').toArray().map(function(cb){return $(cb).data('fc')}); // Get the selected feature collections
                if(toSave.length>0){ // Check if there are any feature collections to save
                    let p = new paper.PaperScope(); // Create a new paper scope object
                    p.setup(); // Setup the paper scope
                    toSave.forEach(function(s){ // For each feature collection
                        p.project.addLayer(s.layer.clone({insert:false,deep:true})); // Add a cloned layer to the paper project
                    })
                    let blob = new Blob([p.project.exportSVG({asString:true,bounds:'content'})],{type:'text/svg'}); // Create a blob object with the SVG string
                    let filename=$(this).data('label');  // Get the file name from the button data
                    let dl = $('<div>',{class:'download-link'}).insertAfter(this); // Create a div element for the download link
                    $('<a>',{href:window.URL.createObjectURL(blob),download:filename,target:'_blank'}).appendTo(dl).text('Download file'); // Create an anchor element with the blob URL and append it to the div element
                }
            })
        }

        /**
         * Exports the feature collections as a SVG file.
         * @function
         * @memberof AtkMap
         * @param {Object} atk - The AtkMap object that contains the features.
         * @returns {void}
         */
        function exportSVG(atk){
            initDlg(); // Initialize the dialog box
            let fcs = atk.toGeoJSON(); // Convert the features to GeoJSON format
            let list = setupFeatureCollectionList(fcs); // Create a list of feature collections
            let finishbutton = setupFinalize('Create file','Choose file name:',getFileName()+'-FeatureCollections.svg'); // Create a button to finalize the file name
            finishbutton.on('click',function(){ // Add a click event handler to the button
                $(this).parent().find('.download-link').remove(); // Remove any existing download links
                let toSave=list.find('input:checked').toArray().map(function(cb){return $(cb).data('fc')}); // Get the selected feature collections
                if(toSave.length>0){ // Check if there are any feature collections to save
                    let p = new paper.PaperScope(); // Create a new paper scope object
                    p.setup(); // Setup the paper scope
                    toSave.forEach(function(s){ // For each feature collection
                        p.project.addLayer(s.layer.clone({insert:false,deep:true})); // Add a cloned layer to the paper project
                    })
                    let blob = new Blob([p.project.exportSVG({asString:true,bounds:'content'})],{type:'text/svg'}); // Create a blob object with the SVG string
                    let filename=$(this).data('label');  // Get the file name from the button data
                    let dl = $('<div>',{class:'download-link'}).insertAfter(this); // Create a div element for the download link
                    $('<a>',{href:window.URL.createObjectURL(blob),download:filename,target:'_blank'}).appendTo(dl).text('Download file'); // Create an anchor element with the blob URL and append it to the div element
                }
            })
        }


        /**
         * Creates a button to finalize the file name and an optional editable content element.
         * @function
         * @memberof AtkMap
         * @param {string} buttonText - The text to display on the button.
         * @param {string} [editableLabel] - The label for the editable content element. If omitted, no editable content element is created.
         * @param {string} [editableContent] - The initial content for the editable content element. If omitted, no editable content element is created.
         * @param {boolean} [localstorage] - A flag to indicate whether to use local storage for the editable content element. If true, the element will have a class 'key-exists' if the content matches a key in local storage.
         * @returns {jQuery} The button element with data attributes 'label' and 'ec'.
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
         * Returns a HTML string for the file dialog.
         * @function
         * @memberof AtkMap
         * @returns {string} The HTML string for the file dialog.
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
    show(){
        this.element.dialog('open');
    }
    hide(){
        this.element.dialog('close');
    }
    toggle(){
        this.element.dialog('isOpen') ? this.element.dialog('close') : this.element.dialog('open');
    }
    dialog(...args){
        this.element.dialog(...args)
    }
}