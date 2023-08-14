import {AnnotationUITool, AnnotationUIToolbarBase} from './annotationUITool.mjs';
import { PointText } from '../paperitems/pointtext.mjs';

/**
 * The PointTextTool class empowers the annotation UI with the ability to add point-based text annotations.
 * This class extends the AnnotationUITool and is paired with the PointTextToolbar for interactive control.
 * @class
 * @memberof OSDPaperjsAnnotation
 * 
 */
class PointTextTool extends AnnotationUITool{
/**
 * Initialize the PointTextTool with Paper.js scope, cursor representation, and toolbar controls.
 *
 * @param {paper.PaperScope} paperScope - The Paper.js scope for the tool.
 *
 * @property {paper.PointText} cursor - The visual representation of the text cursor.
 * @property {Function} extensions.onActivate - Callback function to activate the PointTextTool, showing the cursor and handling item creation or modification.
 * @property {Function} extensions.onDeactivate - Callback function to deactivate the PointTextTool, hiding the cursor and resetting overlay classes.
 * @property {Function} onSelectionChanged - Callback function to update the cursor visibility based on item creation status and update the text input.
 * @property {Function} tool.onMouseMove - Event handler for cursor movement on mouse move, updating the cursor position and overlay classes for dragging.
 * @property {Function} tool.onMouseDown - Event handler for mouse down, responsible for creating or initiating dragging of items.
 * @property {Function} tool.onMouseDrag - Event handler for mouse drag, used for dragging items.
 * @property {Function} tool.onMouseUp - Event handler for mouse up, triggered after dragging items.
 */
    constructor(paperScope){
        super(paperScope);
        let tool = this.tool;
        let self=this;
        let dragging=false;
        
        /**
         * The visual representation of the text cursor.
         * @type {paper.PointText}
         */
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
export{PointTextTool};


/**
 * The PointTextToolbar class enhances the PointTextTool by providing an interactive toolbar for text annotation controls.
 * This class extends the AnnotationUIToolbarBase to manage the toolbar's behavior.
 * @class
 * @memberof OSDPaperjsAnnotation.PointTextTool
 * 
 * 
 */

class PointTextToolbar extends AnnotationUIToolbarBase{
    /**
     * Create a new instance of the PointTextToolbar, complementing the associated PointTextTool.
     *
     * @param {PointTextTool} tool - The corresponding PointTextTool instance.
     */
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
    /**
     * Update the input element's text content.
     *
     * @param {string} text - The text to be set in the input.
     */
    setItemText(text){
        this.input.val(text);
    }
    /**
     * Retrieve the current value from the input element.
     *
     * @returns {string} The value from the input.
     */
    getValue(){
        let input = this.input[0];
        return input.value.trim() || input.getAttribute('placeholder');
    }
    /**
     * Determine if the toolbar is enabled for the given annotation mode.
     *
     * @param {string} mode - The current annotation mode.
     * @returns {boolean} True if the toolbar is enabled, otherwise false.
     */
    isEnabledForMode(mode){
        this.updateInstructions(mode);
        return ['new','Point:PointText'].includes(mode);
    }
    
    /**
     * Update the instructional text based on the current annotation mode.
     *
     * @param {string} mode - The current annotation mode.
     */
    updateInstructions(mode){
        this.instructions.text(mode=='new'?'Click to drop wisdom' : mode=='Point:PointText' ? 'Drag to reposition' : '???' )
    }
}