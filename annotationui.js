//requires jquery, jqueryui
//styles in annotationui.css
//events: raises AnnotationUI events on the OpenSeadragon viewer. The data object contains an eventName field.
import 'https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.12.1/jquery-ui.min.js';
import 'https://cdnjs.cloudflare.com/ajax/libs/bootstrap-toggle/2.2.2/js/bootstrap-toggle.min.js';
import { MainDialog } from './maindialog.js';

$('head').append('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.12.1/jquery-ui.min.css">');
$('head').append('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-toggle/2.2.2/css/bootstrap-toggle.min.css">');
$('head').append('<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css">');
// $('head').append('<link rel="stylesheet" href="./annotationui.css">');
console.log('Location of annotationui.js module',import.meta);
// - ui-added
function AnnotationUI(openSeadragon, opts={}){
    let defaultOpts = {
        autoOpen:true,
        removeOnClose:true,
        featureCollections:[],
    }
    opts = Object.assign(defaultOpts,opts);

    let _viewer = openSeadragon;
    _viewer.addOnceHandler('close',remove);
    // _viewer.addHandler('AnnotationPaper',handlePaperEvent);

    let button = new OpenSeadragon.Button({
        tooltip: 'AnnotationUI',
        srcRest: _viewer.prefixUrl+`annotationui_rest.png`,
        srcGroup: _viewer.prefixUrl+`annotationui_grouphover.png`,
        srcHover: _viewer.prefixUrl+`annotationui_hover.png`,
        srcDown: _viewer.prefixUrl+`annotationui_pressed.png`,
        onClick: function(){
            dialog.toggle()
        }
    });
    _viewer.addControl(button.element, { anchor: OpenSeadragon.ControlAnchor.TOP_LEFT });

    let Paper = _viewer.annotationPaper || _viewer.addAnnotationPaper();//make this create annotationPaper if it doesn't exist

    let dialog = new MainDialog({
        AnnotationPaper:Paper,
        filename:_viewer.world.getItemAt(_viewer.currentPage()).source.name,
        positioningElement:_viewer.navigator.element});
    opts.autoOpen ? dialog.open() : dialog.close();
    
    if(opts.featureCollections){
        opts.featureCollections.forEach(function(f){dialog.addFeatureCollection(f)});
        // dialog.refresh();
    }
    
    broadcast('ui-added');
    
    return {
        dialog:function(){return dialog},
        remove:remove,
        toGeoJSON:function(opts){ return dialog.toGeoJSON(opts) },
        loadGeoJSON:function(geoJSON,opts){ return dialog.loadGeoJSON(geoJSON,opts) },
        onSave:function(callback){
            dialog.saveHandler = callback;
        }
    }

    function remove(){
        dialog && dialog.destroy();
        _viewer.removeControl(button.element);
        // annotationToolbar && annotationToolbar.destroy();
    }

    function broadcast(eventname,data={}){
        data.eventName=eventname;
        // console.log('raising',data)
        _viewer.raiseEvent('AnnotationUI', data);
    }
   
    
}
    
    //modified from https://stackoverflow.com/a/32922084/1214731
    // function deepEqual(x, y) {
    //     const ok = Object.keys, tx = typeof x, ty = typeof y;
    //     return x && y && tx === 'object' && tx === ty? (
    //       ok(x).length === ok(y).length &&
    //         ok(x).every(function(key){return deepEqual(x[key], y[key])})
    //     ) : (x === y);
    //   }

    
      
    
    // }

export {AnnotationUI}