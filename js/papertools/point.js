import {ToolBase, ToolbarBase} from './base.js';
import { AnnotationItemPoint } from '../paperitems/annotationitempoint.js';
export class PointTool extends ToolBase{
    constructor(project){
        super(project);
        let tool = this.tool;
        let self=this;
        let dragging=false;
        let cursor = new AnnotationItemPoint({geometry:{type:'Point',coordinates:[0,0]}});
        cursor.fillColor=null;
        cursor.strokeColor='grey';
        // cursor.strokeWidth='1';
        // cursor.rescale.strokeWidth=1;
        cursor.visible=false;
        this.project.paperScope.project.layers.toolLayer.addChild(cursor);
        this.setToolbarControl(new PointToolbar(this));
        this.extensions.onActivate=function(){
            self.project.paperScope.project.activeLayer.addChild(cursor);
            if(self.itemToCreate) cursor.visible = true;
        }
        this.extensions.onDeactivate=function(){
            self.project.paperScope.project.layers.toolLayer.addChild(cursor);
            cursor.visible=false;
            self.project.overlay.removeClass('point-tool-grab', 'point-tool-grabbing');
        }
        this.onSelectionChanged = function(){
            cursor.visible = !!this.itemToCreate;
        }
        tool.onMouseMove=function(ev){
            cursor.position = ev.point;
            if(ev.item && self.item.hitTest(ev.point)){
                self.project.overlay.addClass('point-tool-grab');
            }
            else{
                self.project.overlay.removeClass('point-tool-grab');
            }   
        }
        tool.onMouseDown=function(ev){
            if(self.itemToCreate){
                self.project.paperScope.initializeItem('Point');
                self.getSelectedItems();
                self.item.position=ev.point;
                cursor.visible=false;
                self.toolbarControl.updateInstructions('Point');
            }
            else{
                if(self.item&&self.item.hitTest(ev.point)){
                    dragging=true;
                    self.project.overlay.addClass('point-tool-grabbing')
                }
            }
        }
        tool.onMouseDrag=function(ev){
            if(dragging){
                self.item && (self.item.position = self.item.position.add(ev.delta))
            }
        }
        tool.onMouseUp=function(ev){
            dragging=false;
            self.project.overlay.removeClass('point-tool-grabbing');
        }
    } 
}

class PointToolbar extends ToolbarBase{
    constructor(tool){
        super(tool);
        let html = $('<i>',{class:'fa-solid fa-map-pin'});
        this.button.configure(html,'Point Tool');
        this.instructions=$('<span>').text('').appendTo(this.dropdown);
    }
    isEnabledForMode(mode){
        this.updateInstructions(mode);
        return ['new','Point'].includes(mode);
    }
    updateInstructions(mode){
        this.instructions.text(mode=='new'?'Click to drop a pin' : mode=='Point' ? 'Drag to reposition' : '???' )
    }
}