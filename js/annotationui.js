//requires jquery, jqueryui
//styles in annotationui.css
//events: raises AnnotationUI events on the OpenSeadragon viewer. The data object contains an eventName field.
import 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js';
import 'https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.12.1/jquery-ui.min.js';
import 'https://cdnjs.cloudflare.com/ajax/libs/bootstrap-toggle/2.2.2/js/bootstrap-toggle.min.js';
import {addCSS} from './addcss.js';
import './annotationpaper.js';
import { MainDialog } from './maindialog.js';

addCSS('https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.12.1/jquery-ui.min.css','jquery-ui');
// if(window.location.hash == '#bs') addCSS('https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css','bootstrap');
addCSS('https://cdnjs.cloudflare.com/ajax/libs/bootstrap-toggle/2.2.2/css/bootstrap-toggle.min.css','bootstrap-toggle');
addCSS('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.1.1/css/all.min.css','font-awesome/6.1.1/css/all');
addCSS(`${import.meta.url.match(/(.*?)js\/[^\/]*$/)[1]}css/annotationui.css`,'annotationui');

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
    
    let button = new OpenSeadragon.Button({
        tooltip: 'Annotation interface (i)',
        srcRest: openSeadragon.prefixUrl+`button_rest.png`,
        srcGroup: openSeadragon.prefixUrl+`button_grouphover.png`,
        srcHover: openSeadragon.prefixUrl+`button_hover.png`,
        srcDown: openSeadragon.prefixUrl+`button_pressed.png`,
        onClick: function(){
            dialog.toggle()
        }
    });
    $(button.element).append($('<i>', {class:"fa-solid fa-pencil button-icon"}));
    openSeadragon.buttonGroup.buttons.push(button);
    openSeadragon.buttonGroup.element.appendChild(button.element);

    let Paper = _viewer.annotationPaper || _viewer.addAnnotationPaper();//make this create annotationPaper if it doesn't exist

    let dialog = new MainDialog({
        AnnotationPaper:Paper,
        filename:_viewer.world.getItemAt(_viewer.currentPage()).source.name,
        positioningElement:(_viewer.navigator || _viewer).element,
        appendTo:_viewer.element,
    });
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