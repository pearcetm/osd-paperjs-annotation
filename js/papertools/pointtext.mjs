import {AnnotationUITool, AnnotationUIToolbarBase} from './annotationUITool.mjs';
import { PointText } from '../paperitems/pointtext.mjs';
export class PointTextTool extends AnnotationUITool{
    constructor(paperScope){
        super(paperScope);
        let tool = this.tool;
        let self=this;
        let dragging=false;
        
        let cursor = this.cursor = new PointText({
            geometry:{
                type:'Point',
                coordinates:[0,0],
                properties:{
                    subtype:'PointText',
                    content:'Click to place',
                    strokeWidth: 0,
                }
            },
            properties:{
                label:'Text Tool',
            }
        }).paperItem;
        cursor.isGeoJSONFeature = false;
        cursor.fillColor='grey';
        cursor.strokeColor='black';
        cursor.visible=false;
        this.project.toolLayer.addChild(cursor);
        
        this.setToolbarControl(new PointTextToolbar(this));
        this.extensions.onActivate=function(){
            self.project.paperScope.project.activeLayer.addChild(cursor);
            if(self.itemToCreate){
                // new item to be created - show the cursor
                cursor.visible = true;
            } else if(self.item){
                // modifying an existing item
                self._updateTextInput();
            }
        }
        this.extensions.onDeactivate=function(){
            self.project.toolLayer.addChild(cursor);
            cursor.visible=false;
            self.project.overlay.removeClass('point-tool-grab', 'point-tool-grabbing');
        }
        this.onSelectionChanged = function(){
            cursor.visible = !!this.itemToCreate;
            self._updateTextInput();
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
                self.itemToCreate.initializeGeoJSONFeature('Point','PointText');
                self.refreshItems();
                self.item.children[1].content = self.toolbarControl.getValue();
                self.item.position=ev.point;
                cursor.visible=false;
                self.toolbarControl.updateInstructions('Point:PointText');
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
    _updateTextInput(){
        this.toolbarControl.setItemText(this.item ? this.item.children[1].content : '');
    }
}

class PointTextToolbar extends AnnotationUIToolbarBase{
    constructor(tool){
        super(tool);
        let self = this;
        let html = $('<i>',{class:'fa-solid fa-font'})[0];
        this.button.configure(html,'Text Tool');
        this.instructions=$('<span>',{class:'instructions'}).text('').appendTo(this.dropdown);
        this.input = $('<input>',{type:'text',placeholder:'Enter text'}).appendTo(this.dropdown).on('input',function(){
            let value = self.getValue();
            if(self.tool.item && self.tool.item.annotationItem.subtype=='PointText'){
                self.tool.item.children[1].content = value;
            }
            self.tool.cursor.children[1].content = value;
        });
        this.input.trigger('input');
    }
    setItemText(text){
        this.input.val(text);
    }
    getValue(){
        let input = this.input[0];
        return input.value.trim() || input.getAttribute('placeholder');
    }
    isEnabledForMode(mode){
        this.updateInstructions(mode);
        return ['new','Point:PointText'].includes(mode);
    }
    updateInstructions(mode){
        this.instructions.text(mode=='new' ? 'Click to place' : mode=='Point:PointText' ? 'Drag to reposition' : '???' )
    }
}