import {AnnotationUITool, AnnotationUIToolbarBase} from './annotationUITool.mjs';
import { Point } from '../paperitems/point.mjs';
/**
 * Represents the PointTool class that allows users to create and manipulate Point features on the Paper.js project.
 * This tool provides functionality for creating points on the map, moving them, and updating their properties.
 * @class
 * @memberof OSDPaperjsAnnotation
 * @extends AnnotationUITool
 */
class PointTool extends AnnotationUITool{
    /**
     * Creates an instance of PointTool.
     * @constructor
     * @param {Object} paperScope - The Paper.js paper scope object, which is the context for working with Paper.js functionalities.
     * @description The constructor initializes the PointTool by calling the base class (AnnotationUITool) constructor and sets up the necessary event handlers.
     * It also creates and configures the cursor used to represent the point creation on the map.
     * @property {paper.Tool} tool - The Paper.js Tool object associated with the PointTool.
     * @property {paper.Item} cursor - The Paper.js item representing the cursor for point creation.
     * @property {boolean} dragging - A flag indicating whether the user is currently dragging a point.
     */
    constructor(paperScope){
        super(paperScope);
        let tool = this.tool;
        let self=this;
        let dragging=false;
        
        let cursor = new Point({geometry:{type:'Point',coordinates:[0,0]},properties:{label:'Point Tool'}}).paperItem;
        cursor.fillColor=null;
        cursor.strokeColor='grey';
        cursor.visible=false;
        delete cursor.isGeoJSONFeature; // remove this field since this isn't really part of the GeoJSON structure
        
        this.project.toolLayer.addChild(cursor);
        
        this.setToolbarControl(new PointToolbar(this));
        /**
         * Event handler when the tool is activated.
         * @private
         * @memberof OSDPaperjsAnnotation.PointTool#
         * @description Handles the activation of the PointTool.
         */
        this.extensions.onActivate=function(){
            // self.project.paperScope.project.activeLayer.addChild(cursor);
            self.project.toolLayer.bringToFront();
            if(self.itemToCreate) cursor.visible = true;
        }
        /**
         * Event handler when the tool is deactivated.
         * @private
         * @memberof OSDPaperjsAnnotation.PointTool#
         * @description Handles the deactivation of the PointTool.
         */
        this.extensions.onDeactivate=function(){
            self.project.toolLayer.sendToBack();
            // self.project.toolLayer.addChild(cursor);
            cursor.visible=false;
            self.project.overlay.removeClass('point-tool-grab', 'point-tool-grabbing');
        }
        /**
         * Event handler when the selection changes.
         * @private
         * @memberof OSDPaperjsAnnotation.PointTool#
         * @description Handles the change in selection for the PointTool.
         */
        this.onSelectionChanged = function(){
            cursor.visible = !!this.itemToCreate;
        }
        /**
         * Handles the mouse movement event within the Paper.js project.
         * Updates the cursor's position and adds or removes the 'point-tool-grab' class from the overlay based on whether the cursor is over an existing point.
         * @private
         * @memberof OSDPaperjsAnnotation.PointTool#
         * @param {Object} ev - The mouse move event object containing information about the cursor position.
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
         * Handles the mouse down event within the Paper.js project.
         * If an item is being created, it initializes the GeoJSON feature and updates the toolbar instructions.
         * If an existing point is clicked, it sets the dragging flag to true and adds the 'point-tool-grabbing' class to the overlay.
         * @private
         * @memberof OSDPaperjsAnnotation.PointTool#
         * @param {Object} ev - The mouse down event object containing information about the cursor position.
         */
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
        /**
         * Handles the mouse drag event within the Paper.js project.
         * If the dragging flag is true, it updates the position of the existing point being dragged.
         * @private
         * @memberof OSDPaperjsAnnotation.PointTool#
         * @param {Object} ev - The mouse drag event object containing information about the cursor position and movement.
         */
        tool.onMouseDrag=function(ev){
            if(dragging){
                self.item && (self.item.position = self.item.position.add(ev.delta))
            }
        }
        /**
         * Handles the mouse up event within the Paper.js project.
         * Resets the dragging flag and removes the 'point-tool-grabbing' class from the overlay.
         * @private
         * @param {Object} ev - The mouse up event object containing information about the cursor position.
         * @memberof OSDPaperjsAnnotation.PointTool#
         */
        tool.onMouseUp=function(ev){
            dragging=false;
            self.project.overlay.removeClass('point-tool-grabbing');
        }
    } 
}
export {PointTool};

/**
 * Represents the toolbar for the point annotation tool.
 * @class
 * @memberof OSDPaperjsAnnotation.PointTool
 * @extends AnnotationUIToolbarBase
 */
class PointToolbar extends AnnotationUIToolbarBase{
    /**
     * Creates an instance of PointToolbar.
     * @constructor
     * @param {Object} tool - The point annotation tool instance.
     * @description Initializes the PointToolbar by calling the base class (AnnotationUIToolbarBase) constructor and configuring the toolbar elements.
     * @property {Object} button - The configuration for the toolbar button.
     * @property {Object} instructions - The configuration for the toolbar instructions.
     */
    constructor(tool){
        super(tool);
        let html = $('<i>',{class:'fa-solid fa-map-pin'})[0];
        this.button.configure(html,'Point Tool');
        this.instructions=$('<span>').text('').appendTo(this.dropdown);
    }
    /**
     * Check if the toolbar is enabled for the specified mode.
     * @param {string} mode - The mode to check against.
     * @returns {boolean} Returns true if the toolbar is enabled for the mode, otherwise false.
     * @description Checks if the toolbar is enabled for the specified mode and updates the instructions.
     */
    isEnabledForMode(mode){
        this.updateInstructions(mode);
        return ['new','Point'].includes(mode);
    }
    /**
     * Update the instructions on the toolbar based on the mode.
     * @param {string} mode - The mode for which the instructions are being updated.
     * @description Updates the instructions on the toolbar based on the specified mode.
     */
    updateInstructions(mode){
        this.instructions.text(mode=='new'?'Click to drop a pin' : mode=='Point' ? 'Drag to reposition' : '???' )
    }
}