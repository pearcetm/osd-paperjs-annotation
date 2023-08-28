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
        
        /**
         * Set the toolbar control for the PointTextTool.
         * This function sets the toolbar control using the provided instance of PointTextToolbar.
         * @private
         * @param {PointTextToolbar} toolbarControl - The toolbar control instance to be set.
         */
        this.setToolbarControl(new PointTextToolbar(this));
        /**
         * Activate event handler for the PointTextTool.
         * This function is called when the tool is activated, and it handles the setup of cursor visibility and interaction behavior.
         * @private
         */
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
        /**
         * Deactivate event handler for the PointTextTool.
         * This function is called when the tool is deactivated, and it handles cursor visibility and interaction cleanup.
         * @private
         */
        this.extensions.onDeactivate=function(){
            self.project.toolLayer.addChild(cursor);
            cursor.visible=false;
            self.project.overlay.removeClass('point-tool-grab', 'point-tool-grabbing');
        }
        this.onSelectionChanged = function(){
            cursor.visible = !!this.itemToCreate;
            self._updateTextInput();
        }
        /**
         * Handle the mouse move event for the PointTextTool.
         * This function is called when the user moves the mouse.
         * It updates the position of the cursor and changes the overlay class to indicate potential grabbing.
         * @private
         * @param {paper.MouseEvent} ev - The mouse event containing the move information.
         */
        tool.onMouseMove=function(ev){
            cursor.position = ev.point;
            if(ev.item && self.item.hitTest(ev.point)){
                self.project.overlay.addClass('point-tool-grab');
            }
            else{
                self.project.overlay.removeClass('point-tool-grab');
            }   
        }
        /**
         * Handle the mouse down event for the PointTextTool.
         * This function is called when the user presses the mouse button.
         * It either initializes a new PointText or prepares for dragging an existing item.
         * @param {paper.MouseEvent} ev - The mouse event containing the click information.
         * @private
         */
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
        /**
         * Handle the mouse drag event for the PointTextTool.
         * This function is called when the user drags the mouse.
         * It updates the position of the cursor and moves the PointText item if dragging is active.
         * @private
         * @param {paper.MouseEvent} ev - The mouse event containing the drag information.
         */
        tool.onMouseDrag=function(ev){
            if(dragging){
                self.item && (self.item.position = self.item.position.add(ev.delta))
            }
        }
        /**
         * Handle the mouse up event for the PointTextTool.
         * This function is called when the user releases the mouse button.
         * It stops dragging and updates the overlay class to indicate non-dragging state.
         * @private
         * @param {paper.MouseEvent} ev - The mouse event containing the release information.
         */
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
        this.instructions.text(mode=='new' ? 'Click to place' : mode=='Point:PointText' ? 'Drag to reposition' : '???' )
    }
}