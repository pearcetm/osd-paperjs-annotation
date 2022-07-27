export class FileDialog{


    constructor(maindialog,opts){
        let _this=this;
        this._mainwindow = maindialog;
        this.element = $(fileDialogHtml()).appendTo('body');
        this.element.dialog({autoOpen:false,modal:true,open:initDlg,width:'auto','appendTo':opts.appendTo});
        this.dialog = function(...args){ this.element.dialog(...args) }

        this.element.find('button[data-action="geojson-load"]').on('click',loadGeoJSON)
        this.element.find('button[data-action="geojson-save"]').on('click',saveGeoJSON)
        this.element.find('button[data-action="svg-export"]').on('click',exportSVG)
        this.element.find('button[data-action="png-export"]').on('click',exportPNG)
        this.element.find('button[data-action="ls-store"]').on('click',localstorageStore)
        this.element.find('button[data-action="ls-load"]').on('click',localstorageLoad)

        function initDlg(){
            _this.element.find('.featurecollection-list').empty();
            _this.element.find('.finalize').empty();
        }
        function setupFeatureCollectionList(fcarray){
            let list = _this.element.find('.featurecollection-list').empty();
            let els = fcarray.map(function(fc){
                let label = fc.label && fc.label instanceof Function ? fc.label() : ((fc.properties&&fc.properties.label) || 'Unnamed feature collection'); 
                let d = $('<div>');
                $('<input>',{type:'checkbox',checked:true}).appendTo(d).data('fc',fc);
                $('<label>').text(label).appendTo(d);
                return d;
            });
            list.append(els);
            return list;
        }
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
                    replace.on('click',function(){ _this._mainwindow.loadGeoJSON(geoJSON,{replace:true}); });
                    let add = $('<button>').appendTo(_this.element.find('.finalize')).text('Add new layers');
                    add.on('click',function(){ _this._mainwindow.loadGeoJSON(geoJSON); });
                }
                fr.readAsText(file);
            })
            finput.trigger('click');
        }
        function localstorageLoad(){
            initDlg();
            let geoJSON=[];
            let filename=_this._mainwindow.filename;
            let lsdata = window.localStorage.getItem(filename);
            if(!lsdata){
                alert('No data found in local storage for this filename');
                return;
            }
            try{
                geoJSON = JSON.parse(lsdata);
            }catch(e){
                alert('Bad data - JSON could not be parsed');
                return;
            }
            let list = setupFeatureCollectionList(geoJSON);
            let replace = $('<button>').appendTo(_this.element.find('.finalize')).text('Replace existing layers');
            replace.on('click',function(){ _this._mainwindow.loadGeoJSON(geoJSON,{replace:true}); });
            let add = $('<button>').appendTo(_this.element.find('.finalize')).text('Add new layers');
            add.on('click',function(){ _this._mainwindow.loadGeoJSON(geoJSON); });
            
        }
        function saveGeoJSON(){
            initDlg();
            let fcs = _this._mainwindow.toGeoJSON({asString:false,includeTrashed:false});
            let list = setupFeatureCollectionList(fcs);
            let finishbutton = $('<button>').appendTo(_this.element.find('.finalize')).text('Create file');
            finishbutton.on('click',function(){
                $(this).parent().find('.download-link').remove();
                
                let toSave=list.find('input:checked').toArray().map(function(cb){return $(cb).data('fc')});
                let txt = JSON.stringify(toSave);
                let blob = new Blob([txt],{type:'text/json'});
                let filename=_this._mainwindow.filename+'-FeatureCollections.geoJSON';
                let dl = $('<div>',{class:'download-link'}).insertAfter(this);
                $('<a>',{href:window.URL.createObjectURL(blob),download:filename,target:'_blank'}).appendTo(dl).text('Download file');
            })
        }
        function exportSVG(){
            initDlg();
            let fcs = _this._mainwindow.getFeatureCollections();
            let list = setupFeatureCollectionList(fcs);
            let finishbutton = $('<button>').appendTo(_this.element.find('.finalize')).text('Create file');
            finishbutton.on('click',function(){
                $(this).parent().find('.download-link').remove();
                let toSave=list.find('input:checked').toArray().map(function(cb){return $(cb).data('fc')});
                if(toSave.length>0){
                    let p = new paper.PaperScope();
                    p.setup();
                    toSave.forEach(function(s){
                        p.project.addLayer(s.paperObjects.layer.clone({insert:false,deep:true}));
                    })
                    let blob = new Blob([p.project.exportSVG({asString:true,bounds:'content'})],{type:'text/svg'});
                    let filename=_this._mainwindow.filename+'-FeatureCollections.svg';
                    let dl = $('<div>',{class:'download-link'}).insertAfter(this);
                    $('<a>',{href:window.URL.createObjectURL(blob),download:filename,target:'_blank'}).appendTo(dl).text('Download file');
                }
            })
        }
        function exportPNG(){
            initDlg();
            let fcs = _this._mainwindow.getFeatureCollections();
            let list = setupFeatureCollectionList(fcs);
            let finishbutton = $('<button>').appendTo(_this.element.find('.finalize')).text('Create file');
            finishbutton.on('click',function(){
                $(this).parent().find('.download-link').remove();
                let toSave=list.find('input:checked').toArray().map(function(cb){return $(cb).data('fc')});
                if(toSave.length>0){
                    let p = new paper.PaperScope();
                    p.setup();
                    toSave.forEach(function(s){
                        p.project.activeLayer.addChildren(s.paperObjects.layer.clone({insert:false,deep:true}).children);
                    })
                    // let blob = new Blob([p.project.activeLayer.rasterize({insert:false}).toDataURL()],{type:'image/png'});
                    let filename=_this._mainwindow.filename+'-raster.png';
                    let dl = $('<div>',{class:'download-link'}).insertAfter(this);
                    $('<a>',{href:p.project.activeLayer.rasterize({insert:false}).toDataURL(),download:filename,target:'_blank'}).appendTo(dl).text('Download file');
                }
            })
        }
        function localstorageStore(){
            initDlg();
            let fcs = _this._mainwindow.toGeoJSON({asString:false,includeTrashed:false});
            let list = setupFeatureCollectionList(fcs);
            let finishbutton = $('<button>').appendTo(_this.element.find('.finalize')).text('Save data');
            finishbutton.on('click',function(){
                let toSave=list.find('input:checked').toArray().map(function(cb){return $(cb).data('fc')});
                let txt = JSON.stringify(toSave);
                let filename=_this._mainwindow.filename;
                window.localStorage.setItem(filename,txt);
            })
        }

        function fileDialogHtml(){
            return `
                <div class="annotation-ui-filedialog" title="Save and Load Feature Collections">
                    <div class="file-actions">
                        <span class='header'>1. Available actions</span>
                        <button class='btn' data-action='geojson-load'>Load GeoJSON</button>
                        <button class='btn' data-action='ls-load'>Load from browser</button>
                        <hr>
                        <button class='btn' data-action='geojson-save'>Save GeoJSON</button>
                        <button class='btn' data-action='svg-export'>Export as SVG</button>
                        <button class='btn' data-action='png-export'>Rasterize to PNG</button>
                        <button class='btn' data-action='ls-store'>Store in browser</button>
                    </div>
                    <div class='featurecollection-selection'>
                        <span class='header'>2. Select Feature Collections</span>
                        <div class='featurecollection-list'></div>
                    </div>
                    <div>
                        <span class='header'>3. Finalize</span>
                        <div class='finalize'>
                        
                        </div>
                    </div>
                </div>`;
        }
    }
}