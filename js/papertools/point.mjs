import {AnnotationUITool, AnnotationUIToolbarBase} from './annotationUITool.mjs';
import { Point } from '../paperitems/point.mjs';
export class PointTool extends AnnotationUITool{
    constructor(paperScope){
        super(paperScope);
        let tool = this.tool;
        let self=this;
        let dragging=false;
        
        let cursor = new Point({geometry:{type:'Point',coordinates:[0,0]},properties:{label:'Point Tool'}}).paperItem;
        cursor.fillColor=null;
        cursor.strokeColor='grey';
        cursor.visible=false;
        this.project.toolLayer.addChild(cursor);
        
        this.setToolbarControl(new PointToolbar(this));
        this.extensions.onActivate=function(){
            // self.project.paperScope.project.activeLayer.addChild(cursor);
            self.project.toolLayer.bringToFront();
            if(self.itemToCreate) cursor.visible = true;
        }
        this.extensions.onDeactivate=function(){
            self.project.toolLayer.sendToBack();
            // self.project.toolLayer.addChild(cursor);
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
                self.itemToCreate.initializeGeoJSONFeature('Point');
                self.refreshItems();
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

class PointToolbar extends AnnotationUIToolbarBase{
    constructor(tool){
        super(tool);
        let html = $('<i>',{class:'fa-solid fa-map-pin'})[0];
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