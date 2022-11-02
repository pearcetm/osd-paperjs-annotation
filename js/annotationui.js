//requires jquery, jqueryui
//styles in annotationui.css
//events: raises AnnotationUI events on the OpenSeadragon viewer. The data object contains an eventName field.
import 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js';
import 'https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.12.1/jquery-ui.min.js';
import {addCSS} from './addcss.js';
// import {AnnotationToolkit} from './annotationtoolkit.js';
import {AnnotationToolbar} from './annotationtoolbar.js';
import { MainDialog } from './maindialog.js';

addCSS('https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.12.1/jquery-ui.min.css','jquery-ui');
addCSS('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.1.1/css/all.min.css','font-awesome/6.1.1/css/all');
addCSS(`${import.meta.url.match(/(.*?)js\/[^\/]*$/)[1]}css/annotationui.css`,'annotationui');
addCSS(`${import.meta.url.match(/(.*?)js\/[^\/]*$/)[1]}css/osd-button.css`,'osd-button');

// console.log('Location of annotationui.js module',import.meta);
// - ui-added
function AnnotationUI(annotationToolkit, opts={}){
    let self=this;
    let defaultOpts = {
        autoOpen:true,
        featureCollections:[],
    }
    opts = Object.assign(defaultOpts,opts);

    let _viewer = annotationToolkit.viewer;//shorter alias

    let button = _viewer.addButton({
        onClick:function(){
            dialog.toggle();
            dialog.isOpen() ? toolbar.show() : toolbar.hide();
        },
        faIconClasses:'fa-solid fa-pencil',
        tooltip:'Annotation Interface',
    })
    
    //AnnotationToolbar: UI for interactive tools
    let toolbar = new AnnotationToolbar(annotationToolkit.overlay.paperScope);
    toolbar.addToOpenSeadragon(_viewer);

    //MainDialog: UI for managing collections/features
    let dialog = this._dialog = new MainDialog(annotationToolkit.overlay.paperScope,{
        filename:_viewer.world.getItemAt(_viewer.currentPage()).source.name,
        positioningElement:(_viewer.navigator || _viewer).element,
        appendTo:_viewer.element,
        toolbar:toolbar,
    });
    
    //reset viewer's mouse tracker to parent container of viewer instead of inner container, so tracker captures UI dialogs as well
    _viewer.outerTracker.setTracking(false);
    _viewer.outerTracker.element = _viewer.element;
    _viewer.outerTracker.setTracking(true);


    opts.autoOpen ? (dialog.open(),toolbar.show()) : (dialog.close(),toolbar.hide());

    if(opts.featureCollections){
        addFeatureCollections(opts.featureCollections)
        // dialog.refresh();
    }
    
    broadcast('ui-added');
    
    return {
        dialog:function(){return dialog},
        destroy:destroy,
        toGeoJSON:function(opts){ return dialog.toGeoJSON(opts) },
        loadGeoJSON:function(geoJSON,opts){ return dialog.loadGeoJSON(geoJSON,opts) },
        onSave:function(callback){
            dialog.saveHandler = callback;
        },
        addFeatureCollections:addFeatureCollections,
    }
    function addFeatureCollections(fcs){
        fcs.forEach(function(f){dialog.addFeatureCollection(f)});
    }
    function destroy(){
        dialog.destroy();
        toolbar.destroy();
        let el = button.element;
        let idx = _viewer.buttonGroup.buttons.indexOf(button);
        if(idx>-1)_viewer.buttonGroup.buttons.splice(idx,1);
        el.remove();//should this be "button.destroy()" or "button.remove()"?
    }

    function broadcast(eventname,data={}){
        data.eventName=eventname;
        _viewer.raiseEvent('AnnotationUI', data);
    }
   
    
}

export {AnnotationUI}