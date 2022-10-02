
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

        let projectInterface={
            getZoom:()=>paperScope.view.getZoom(),
            getActiveTool:this.getActiveTool, 
            toolLayer:toolLayer,
            paperScope:paperScope,
            overlay:paperScope.overlay,
        }
        
        this.tools = {
            default:new DefaultTool(projectInterface),
            select: new SelectTool(projectInterface),
            transform:new TransformTool(projectInterface),
            style: new StyleTool(projectInterface),
            rectangle:new RectangleTool(projectInterface),
            point: new PointTool(projectInterface),
            polygon: new PolygonTool(projectInterface),
            brush: new BrushTool(projectInterface),
            wand: new WandTool(projectInterface),
            linestring : new LinestringTool(projectInterface),
            raster: new RasterTool(projectInterface),
        }
        Object.keys(this.tools).forEach(function(toolname){
            let toolObj = self.tools[toolname];
            toolObj.tool._toolObject=toolObj;
            toolObj.toolname=toolname;
            let toolbarControl = toolObj.getToolbarControl();
            if(toolbarControl) self.addToolbarControl(toolbarControl);

            // if(toolObj !== tools.default){
            toolObj.addEventListener('deactivated',function(ev){
                //If deactivation is triggered by another tool being activated, this condition will fail
                if(ev.target == self.getActiveTool()){
                    self.tools.default.activate();
                }
            })
            
        })
        this.tools.default.activate();

        this.setMode();

        //items emit events on the paper project; add listeners to update the toolbar status as needed
        paperScope.project.on({
            'item-replaced':function(ev){
                // console.log('project updated', ev)
                self.setMode();
            },
            'item-selected':function(ev){
                self.setMode()
                // let activeTool = self.getActiveTool() && activeTool.selectionChanged();
            },
            'item-deselected':function(ev){
                self.setMode()
                // let activeTool = self.getActiveTool() && activeTool.selectionChanged();
            },
        });

    }
    getActiveTool(){
        return this.paperScope.tool ? this.paperScope.tool._toolObject : null;
    }
    setMode(){
        let self=this;
        this.setModeTimeout && clearTimeout(this.setModeTimeout);
        this.setModeTimeout = setTimeout(()=>{
            this.setModeTimeout=null;
            let selection = this.paperScope.findSelectedItems();
            let activeTool = this.getActiveTool();
            
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

