
import {DefaultTool} from './papertools/default.js';
import {WandTool} from './papertools/wand.js';
import {BrushTool} from './papertools/brush.js';
import {PointTool} from './papertools/point.js';
import {RectangleTool} from './papertools/rectangle.js';
import {StyleTool} from './papertools/style.js';
import {LinestringTool} from './papertools/linestring.js';
import {PolygonTool} from './papertools/polygon.js';
import {SelectTool} from './papertools/select.js';
import {TransformTool} from './papertools/transform.js';
import {RasterTool} from './papertools/raster.js';

export class AnnotationToolbar{

    constructor(paperScope){
        
        let self=this;
        this.ui = makeUI();
        this.paperScope=paperScope;
        // this.tools=[];
        this.currentMode = null;
        this.setModeTimeout = null;

        let toolLayer=new paper.Layer();
        toolLayer.isAnnotationLayer=false;
        toolLayer.name = 'toolLayer';
        paperScope.project.addLayer(toolLayer);

        
        this.tools = {
            default:new DefaultTool(paperScope),
            select: new SelectTool(paperScope),
            transform:new TransformTool(paperScope),
            style: new StyleTool(paperScope),
            rectangle:new RectangleTool(paperScope),
            point: new PointTool(paperScope),
            polygon: new PolygonTool(paperScope),
            brush: new BrushTool(paperScope),
            wand: new WandTool(paperScope),
            linestring : new LinestringTool(paperScope),
            raster: new RasterTool(paperScope),
        }
        Object.keys(this.tools).forEach(function(toolname){
            let toolObj = self.tools[toolname];
            let toolbarControl = toolObj.getToolbarControl();
            if(toolbarControl) self.addToolbarControl(toolbarControl);

            // if(toolObj !== tools.default){
            toolObj.addEventListener('deactivated',function(ev){
                //If deactivation is triggered by another tool being activated, this condition will fail
                if(ev.target == self.paperScope.getActiveTool()){
                    self.tools.default.activate();
                }
            })
            
        })
        this.tools.default.activate();

        this.setMode();

        //items emit events on the paper project; add listeners to update the toolbar status as needed
        paperScope.project.on({
            'item-replaced':function(ev){
                self.setMode();
            },
            'item-selected':function(ev){
                self.setMode()
            },
            'item-deselected':function(ev){
                self.setMode()
            },
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
                let mode = item.instructions ? 'new' : 
                    item.config ? 
                        item.config.geometry.type +(item.config.geometry.properties&&item.config.geometry.properties.subtype? ':'+item.config.geometry.properties.subtype: '') 
                        : arg;
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
        this.viewer = viewer;//save reference so we can remove/destroy this toolbar
        $(this.ui.buttongroup.element).append(this.ui.dropdowns);
        $(viewer.controls.topleft).addClass('viewer-controls-topleft');
        $('.toggles .btn').attr('style','');
    }
    destroy(){
        this.viewer && this.viewer.removeControl(this.ui.buttongroup.element);
        this.viewer && $(this.viewer.controls.topleft).removeClass('viewer-controls-topleft');
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

