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
        
        let cursor = new Point({geometry:{type:'Point',coordinates:[0,0]},properties:{label:'Point Tool'}}).paperItem;
        cursor.fillColor=null;
        cursor.strokeColor='grey';
        cursor.visible=false;
        delete cursor.isGeoJSONFeature; // remove this field since this isn't really part of the GeoJSON structure
        
        this.cursor = cursor;
        this.dragging = false;

        this.project.toolLayer.addChild(cursor);
        
        this.setToolbarControl(new PointToolbar(this));
        
        
        this.extensions.onActivate = ()=>{
            this.project.toolLayer.bringToFront();
            if(this.itemToCreate) this.cursor.visible = true;
        }
        
        
        this.extensions.onDeactivate = ()=>{
            this.project.toolLayer.sendToBack();
            this.cursor.visible=false;
            this.project.overlay.removeClass('point-tool-grab', 'point-tool-grabbing');
        }
        
        
        this.onSelectionChanged = ()=>{
            this.cursor.visible = !!this.itemToCreate;
        }
        
    } 
    
    onMouseMove(ev){
        this.cursor.position = ev.original.point;
        if(this.item.hitTest(ev.point)){
            this.project.overlay.addClass('point-tool-grab');
        }
        else{
            this.project.overlay.removeClass('point-tool-grab');
        }   
    }
    
    onMouseDown(ev){
        if(this.itemToCreate){
            this.itemToCreate.initializeGeoJSONFeature('Point');
            this.refreshItems();
            this.item.position=ev.point;
            this.cursor.visible=false;
            this.toolbarControl.updateInstructions('Point');
        } else {
            if(this.item&&this.item.hitTest(ev.point)){
                this.dragging=true;
                this.project.overlay.addClass('point-tool-grabbing')
            }
        }
    }
    
    onMouseDrag(ev){
        if(this.dragging){
            this.item && (this.item.position = this.item.position.add(ev.delta))
        }
    }
    
    onMouseUp(){
        this.dragging=false;
        this.project.overlay.removeClass('point-tool-grabbing');
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