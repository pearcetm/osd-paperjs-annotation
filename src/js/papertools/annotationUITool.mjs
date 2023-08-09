import {ToolBase} from './base.mjs';

/**
 * Base class for annotation tools, extending the ToolBase class.
 *
 * @class
 * @extends ToolBase
 * @memberof OSDPaperjsAnnotation
 */
class AnnotationUITool extends ToolBase{
    /**
     * Create an AnnotationUITool instance.
     *
     * @constructor
     * @param {paper.PaperScope} paperScope - The Paper.js scope for the tool.
     *
     * @property {boolean} _active - Flag indicating if the tool is currently active.
     * @property {paper.Item[]} _items - Array of selected items.
     * @property {paper.Item} _item - The selected item (if only one is selected).
     * @property {paper.Item} _itemToCreate - The selected new item to be created.
     */
    constructor(paperScope){
        super(paperScope)
        
        this._active=false;
        this._items=[];
        this._item=null;

    }
    
    /**
     * Activate the annotation tool, making it ready for interaction.
     * If another tool was active, it's deactivated before activating this tool.
     */
    activate(){
        if(this._active) return;//breaks possible infinite loops of tools activating/deactivating each other
        this._active=true;
        this.getSelectedItems();
        let previousTool=this.project.paperScope.getActiveTool();
        this.tool.activate();
        this.toolbarControl.activate();//console.log('toolbar control activated')
        previousTool && previousTool != this && previousTool.deactivate(true);

        this.onActivate();
        this.broadcast('activated',{target:this});
    }
    /**
     * Deactivate the annotation tool, stopping its interaction.
     *
     * @param {boolean} finishToolAction - Whether the tool action should be completed before deactivating.
     */
    deactivate(finishToolAction){
        if(!this._active) return;//breaks possible infinite loops of tools activating/deactivating each other
        this._active=false;
        this.toolbarControl.deactivate();

        this.onDeactivate(finishToolAction);
        this.broadcast('deactivated',{target:this}); 
    }
    /**
     * Get the associated toolbar control for the tool.
     *
     * @returns {AnnotationUIToolbarBase} The toolbar control instance.
     */
    getToolbarControl(){
        return this.toolbarControl;
    }
    /**
     * Set the associated toolbar control for the tool.
     *
     * @param {AnnotationUIToolbarBase} toolbarControl - The toolbar control instance to set.
     * @returns {AnnotationUIToolbarBase} The provided toolbar control instance.
     */
    setToolbarControl(toolbarControl){
        this.toolbarControl = toolbarControl;
        return this.toolbarControl;
    }
    /**
     * Refresh the list of currently selected items.
     */
    refreshItems(){
        return this.getSelectedItems();
    }
    /**
     * Retrieve the list of currently selected items.
     */
    getSelectedItems(){
        this._items = this.project.paperScope.findSelectedItems();
        this._itemToCreate = this.project.paperScope.findSelectedNewItem();
    }
    /**
     * Callback function triggered when the selection of items changes.
     * This function can be overridden in subclasses to react to selection changes.
     */
    selectionChanged(){
        this.getSelectedItems();
        this.onSelectionChanged();
    }
    /**
     * Callback function triggered when the selection changes.
     * To be implemented in subclasses.
     */
    onSelectionChanged(){}
    /**
     * Get the array of currently selected items.
     *
     * @returns {paper.Item[]} An array of currently selected items.
     */
    get items(){
        return this._items;
    }
    /**
     * Get the currently selected item, if only one is selected.
     *
     * @returns {paper.Item|null} The currently selected item, or null if no item is selected.
     */
    get item(){
        return this._items.length==1 ? this._items[0] : null;
    }
    /**
     * Get the selected new item to be created.
     *
     * @returns {paper.Item|null} The selected new item, or null if no item is selected.
     */
    get itemToCreate(){
        return this._itemToCreate;
    }
        
}
export{AnnotationUITool};

/**
 * Base class for annotation toolbar controls.
 *
 * @class
 * @memberof OSDPaperjsAnnotation.AnnotationUITool
 */
class AnnotationUIToolbarBase{
    /**
     * Create a new instance of AnnotationUIToolbarBase associated with an annotation tool.
     *
     * @constructor
     * @param {AnnotationUITool} tool - The annotation tool linked to the toolbar control.
     */
    constructor(tool){
        // let self=this;
        this._active=false;
        let button=document.createElement('button');
        button.classList.add('btn','invisible');
        button.textContent = 'Generic Tool';

        this.button=new OpenSeadragon.Button({
            tooltip:'Generic Tool',
            element:button,
            onClick:function(ev){if(!ev.eventSource.element.disabled) tool._active?tool.deactivate(true):tool.activate()},
        });
        this.button.configure=function(node,tooltip){
            this.element.title = tooltip;
            this.element.replaceChildren(node);
            this.element.classList.remove('invisible');
            this.tooltip=tooltip;
        }
        this.dropdown=document.createElement('div');
        this.dropdown.classList.add('dropdown'); 
        this.tool = tool;
    }
    /**
     * Check whether the toolbar control is enabled for a specific mode.
     *
     * @param {string} mode - The mode to check for enabling.
     * @returns {boolean} True if the toolbar control is enabled for the mode, otherwise false.
     */
    isEnabledForMode(mode){
        return false;
    }
    
    /**
     * Activate the toolbar control, making it visually active.
     */
    activate(){
        if(this._active) return;
        this._active=true;
        //this.tool.activate();
        this.button.element.classList.add('active');
        this.dropdown.classList.add('active');
    }
    /**
     * Deactivate the toolbar control, making it visually inactive.
     *
     * @param {boolean} shouldFinish - Whether the action associated with the control should be completed.
     */
    deactivate(shouldFinish){
        if(!this._active) return;
        this._active=false;
        //this.tool.deactivate(shouldFinish);
        this.button.element.classList.remove('active');
        this.dropdown.classList.remove('active');
    }
}
export{AnnotationUIToolbarBase};