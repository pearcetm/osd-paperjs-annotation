//requires jquery, jqueryui
//styles in annotationui.css
import 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js';
import 'https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.12.1/jquery-ui.min.js';
import {addCSS} from './addcss.mjs';
import {AnnotationToolbar} from './annotationtoolbar.mjs';
import { LayerUI } from './layerui.mjs';
import {FileDialog} from './filedialog.mjs';

addCSS('https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.12.1/jquery-ui.min.css','jquery-ui');
addCSS('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.1.1/css/all.min.css','font-awesome/6.1.1/css/all');
addCSS(`${import.meta.url.match(/(.*?)js\/[^\/]*$/)[1]}css/annotationui.css`,'annotationui');
addCSS(`${import.meta.url.match(/(.*?)js\/[^\/]*$/)[1]}css/osd-button.css`,'osd-button');
addCSS(`${import.meta.url.match(/(.*?)js\/[^\/]*$/)[1]}css/editablecontent.css`,'editablecontent');


class AnnotationUI{
    constructor(annotationToolkit,opts){
        let defaultOpts = {
            autoOpen:true,
            featureCollections:[],
            addButton:true,
            addToolbar:true,
            addLayerDialog:true,
            addFileButton:true,
            buttonTogglesToolbar:true,
            buttonTogglesLayerUI:true,
        }
        opts = this.options = Object.assign(defaultOpts,opts);

        let _viewer = this._viewer = annotationToolkit.viewer;//shorter alias
        this._isOpen = !!opts.autoOpen;

        
        //AnnotationToolbar: UI for interactive tools
        this._toolbar = new AnnotationToolbar(annotationToolkit.overlay.paperScope);
        if(opts.addToolbar){
            this._toolbar.addToOpenSeadragon(_viewer);
        }


        //FileDialog: UI for loading/saving data
        this._fileDialog = new FileDialog(annotationToolkit,{appendTo:_viewer.element});
        this._filebutton = null;
        if(opts.addFileButton){
            this._filebutton = annotationToolkit.overlay.addViewerButton({
                onClick:()=>{
                    this._fileDialog.toggle();
                },
                faIconClasses:'fa-solid fa-save',
                tooltip:'Save/Load Annotations',
            })
        }       

        //LayerUI: UI for managing collections/features
        let dialogOpts={
            filename:_viewer.world.getItemAt(0) && this._viewer.world.getItemAt(0).source.name,
            positioningElement:(this,_viewer.navigator || this._viewer).element,
            appendTo:this._viewer.element,
            toolbar:this._toolbar,
        }
        this._layerUI = new LayerUI(annotationToolkit.overlay.paperScope, dialogOpts);
        if(opts.addLayerDialog){
            this._createJqueryUIdialog();
        }
 

        opts.autoOpen ? (this._layerUI.show(),this._toolbar.show()) : (this._layerUI.hide(),this._toolbar.hide());

        //Button for controlling LayerUI and/or AnnotationToolbar
        this._button = null;
        if(opts.addButton){
            this._button = annotationToolkit.overlay.addViewerButton({
                onClick:()=>{
                    this._isOpen = !this._isOpen;
                    if(this._isOpen){
                        this.options.buttonTogglesToolbar && this._toolbar.show();
                        this.options.buttonTogglesLayerUI && this._layerUI.show();
                    } else{
                        this.options.buttonTogglesToolbar && this._toolbar.hide();
                        this.options.buttonTogglesLayerUI && this._layerUI.hide();
                    }
                },
                faIconClasses:'fa-solid fa-pencil',
                tooltip:'Annotation Interface',
            })
        }

        if(opts.featureCollections){
            annotationToolkit.loadGeoJSON(opts.featureCollections);
        }
    }
    
    destroy(){
        this._layerUI.destroy();
        this._toolbar.destroy();
        if(this._button){
            let idx = this._viewer.buttonGroup.buttons.indexOf(this._button);
            if(idx>-1){
                this._viewer.buttonGroup.buttons.splice(idx,1);
            }
            this._button.element.remove();//should this be "button.destroy()" or "button.remove()"?
        }
        if(this._filebutton){
            let idx = this._viewer.buttonGroup.buttons.indexOf(this._filebutton);
            if(idx>-1){
                this._viewer.buttonGroup.buttons.splice(idx,1);
            }
            this._filebutton.element.remove();//should this be "button.destroy()" or "button.remove()"?
        }
        
    }
    
    //private
    _createJqueryUIdialog(){
        let element = this._layerUI.element;

        let positioningElement=$((this._viewer.navigator || this._viewer).element);

        element.on('element-added',function(ev){
            let el = $(ev.target);
            refreshDialogPosition(el);
        })
        element.dialog({
            open:onOpen,
            resize:limitHeight,
            autoOpen:false,
            closeOnEscape:false,
            height:'auto',
            appendTo:this._viewer.element,
        });
        element.closest('.ui-dialog').draggable('option','containment','parent')
        
        this._layerUI.addHandler('show',()=>{
            element.dialog('open');
        });
        this._layerUI.addHandler('hide',()=>{
            element.dialog('close');
        });
        this._layerUI.addHandler('destroy',()=>{
            element.dialog('destroy');
        })

        //reset viewer's mouse tracker to parent container of viewer instead of inner container, so tracker captures UI dialogs as well
        //to do: reset this on removal of the annotationUI?
        this._viewer.outerTracker.setTracking(false);
        this._viewer.outerTracker.element = this._viewer.element;
        this._viewer.outerTracker.setTracking(true);

        let fb=$('<button>',{class:'file-button'}).text('File')
        .prependTo(element.dialog('instance').classesElementLookup['ui-dialog-title'])
        .on('click',()=>{
            this._fileDialog.dialog('open');    
        });
        fb.button({
            showLabel:true,
        })


        function onOpen(){
            positionDialog();
        }
        
        function positionDialog(pos){
            let defaultPos={my:'right top', at:'right top', of:positioningElement}
            if(positioningElement.hasClass('navigator')){
                defaultPos={my:'right top', at:'right bottom', of:positioningElement}
            }
            
            pos = pos || defaultPos;

            element.dialog('option','position',pos);
            window.setTimeout(limitHeight,0)        
        }
        function limitHeight(){
            let topOfFCList = element.offset().top;
            let bottomOfVisibleWindow = $(window).height();
            let maxheight = bottomOfVisibleWindow - topOfFCList - (element.outerHeight()-element.height())-5;
            element.css({maxHeight:maxheight})
        }
        function refreshDialogPosition(scrolltoelement){
            let pos = element.dialog('option','position');
            positionDialog(pos);
            scrolltoelement && setTimeout(()=>{
                //scrolltoelement[0].scrollIntoView(false)
                scrolltoelement[0].scrollIntoView({block: "nearest", inline: "nearest"})
            }, 0);
        }
    }
    
}

export {AnnotationUI}