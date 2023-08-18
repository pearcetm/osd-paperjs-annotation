
import {DefaultTool} from './papertools/default.mjs';
import {WandTool} from './papertools/wand.mjs';
import {BrushTool} from './papertools/brush.mjs';
import {PointTool} from './papertools/point.mjs';
import {PointTextTool} from './papertools/pointtext.mjs';
import {RectangleTool} from './papertools/rectangle.mjs';
import {EllipseTool} from './papertools/ellipse.mjs';
import {StyleTool} from './papertools/style.mjs';
import {LinestringTool} from './papertools/linestring.mjs';
import {PolygonTool} from './papertools/polygon.mjs';
import {SelectTool} from './papertools/select.mjs';
import {TransformTool} from './papertools/transform.mjs';
import {RasterTool} from './papertools/raster.mjs';

export class AnnotationToolbar{

    constructor(paperScope, tools){
        // tools should be an array of strings, or null/falsey
        if(tools && !Array.isArray(tools)){
            throw('Bad option: if present, tools must be an Array of tool names to use.');
        }
        this.ui = makeUI();
        this.paperScope=paperScope;
        
        this.currentMode = null;
        this.setModeTimeout = null;

        let toolLayer=new paperScope.Layer();
        toolLayer.isGeoJSONFeatureCollection=false;
        toolLayer.name = 'toolLayer';
        paperScope.project.addLayer(toolLayer);

        this.toolConstructors = {
            default:DefaultTool,
            select: SelectTool,
            transform: TransformTool,
            style:  StyleTool,
            rectangle: RectangleTool,
            ellipse: EllipseTool,
            point: PointTool,
            text: PointTextTool,
            polygon: PolygonTool,
            brush: BrushTool,
            wand: WandTool,
            linestring : LinestringTool,
            raster: RasterTool,
        }
        this.tools = {};

        // if array of tools was passed in, use that. Otherwise use all available ones listed in the toolConstructors dictionary
        let toolsToUse = tools || Object.keys(this.toolConstructors);
        // make sure the default tool is always included
        if(toolsToUse.indexOf('default') == -1){
            toolsToUse = ['default', ...toolsToUse];
        }
        toolsToUse.forEach(toolname => {
            if(!this.toolConstructors[toolname]){
                console.warn(`The requested tool is invalid: ${toolname}. No constructor found for that name.`);
                return;
            }

            let toolObj = this.tools[toolname] = new this.toolConstructors[toolname](this.paperScope);
            let toolbarControl = toolObj.getToolbarControl();
            if(toolbarControl) this.addToolbarControl(toolbarControl);

            // if(toolObj !== tools.default){
            toolObj.addEventListener('deactivated',ev => {
                //If deactivation is triggered by another tool being activated, this condition will fail
                if(ev.target == this.paperScope.getActiveTool()){
                    this.tools.default.activate();
                }
            });
            
        })
        this.tools.default.activate();

        this.setMode();

        //items emit events on the paper project; add listeners to update the toolbar status as needed
        paperScope.project.on({
            'item-replaced':()=>{
                this.setMode();
            },
            'item-selected':()=>{
                this.setMode()
            },
            'item-deselected':()=>{
                this.setMode()
            },
            'item-removed':()=>{
                this.setMode()
            },
            'items-changed':()=>{
                this.setMode();
            }
        });

    }
    
    setMode(){
        let self=this;
        this.setModeTimeout && clearTimeout(this.setModeTimeout);
        this.setModeTimeout = setTimeout(()=>{
            this.setModeTimeout=null;
            let selection = this.paperScope.findSelectedItems();
            let activeTool = this.paperScope.getActiveTool();
            
            if(selection.length==0){
                this.currentMode='select';
            }
            else if(selection.length==1){
                let item=selection[0];
                let def = item.annotationItem || {};
                let type = def.type;
                if(def.subtype) type += ':' + def.subtype;
                let mode = type === null ? 'new' : type;
                this.currentMode = mode;
            }
            else{
                this.currentMode = 'multiselection'
            }
            
            if(activeTool.getToolbarControl().isEnabledForMode(this.currentMode) == false) {
                activeTool.deactivate(true)
                this.tools.default.activate()
            }
            Object.values(this.tools).forEach(toolObj=>{
                let t = toolObj.getToolbarControl();
                t && ( t.isEnabledForMode(self.currentMode) ? t.button.enable() : t.button.disable() );
            })
            activeTool.selectionChanged();
        }, 0);
    }
    
    addToolbarControl(toolbarControl){
        toolbarControl.button && toolbarControl.button.element && this.ui.buttongroup.buttons.push(toolbarControl.button)
        toolbarControl.dropdown && this.ui.dropdowns.append(toolbarControl.dropdown);
        toolbarControl.isEnabledForMode(this.currentMode) ? toolbarControl.button.enable() : toolbarControl.button.disable();
    }
    show(){
        $(this.ui.buttongroup.element).show();
    }
    hide(){
        $(this.ui.buttongroup.element).hide();
    }
    addToOpenSeadragon(viewer){
        let bg = new OpenSeadragon.ButtonGroup({buttons:this.ui.buttongroup.buttons,element:this.ui.buttongroup.element});
        viewer.addControl(bg.element,{anchor:OpenSeadragon.ControlAnchor.TOP_LEFT});
        // get the new OpenSeadragon.Control object
        this.control = viewer.controls[viewer.controls.length-1];
        this.viewer = viewer;//save reference so we can remove/destroy this toolbar
        let handler = event=>{
            console.log('Mouse nav changed',event);
            // this.control.setVisible(true);
            // if mouse nav is enabled, enable autoFade, otherwise disable
            if(event.overlay == this.paperScope.overlay){
                this.control.autoFade = event.enabled;
            }
        }
        this._mousenavhandler = handler;
        this.viewer.addHandler('mouse-nav-changed',handler);
        $(this.ui.buttongroup.element).append(this.ui.dropdowns);
        $(viewer.controls.topleft).addClass('viewer-controls-topleft');
        $('.toggles .btn').attr('style','');
    }
    destroy(){
        if(this.viewer){
            this.viewer.removeControl(this.ui.buttongroup.element);
            $(this.viewer.controls.topleft).removeClass('viewer-controls-topleft');
            this.viewer.removeHandler(this._mousenavhandler);
        } 
        this.ui.dropdowns.parent().remove();
    } 
}

function makeUI(){
    //make a container div
    let t = $('<div>',{class:'annotation-ui-drawing-toolbar btn-group btn-group-sm mode-selection'});
    let bg = {buttons:[],element:t[0]};
    let dropdowns=$('<div>',{class:'dropdowns'}).appendTo(t);
    return {
        buttongroup:bg,
        dropdowns:dropdowns,
    }
}

