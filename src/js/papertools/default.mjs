import {AnnotationUITool, AnnotationUIToolbarBase} from './annotationUITool.mjs';
/**
 * Default annotation tool that extends the AnnotationUITool class.
 * Used for image navigation and interaction with annotations.
 *
 * @class
 * @extends AnnotationUITool
 * @memberof OSDPaperjsAnnotation
 */
class DefaultTool extends AnnotationUITool{
    /**
     * Create a DefaultTool instance for image navigation and annotation interaction.
     *
     * @constructor
     * @param {paper.PaperScope} paperScope - The Paper.js scope for the tool.
     */
    constructor(paperScope){
        super(paperScope);
        /**
         * Initialize the default toolbar control associated with the tool.
         */
        this.setToolbarControl(new DefaultToolbar(this));
    }
    // getToolbarControl(){}//override this so no button gets added
    /**
     * Callback function triggered when the tool is deactivated.
     * To be implemented in subclasses.
     */
    onDeactivate(){}
    /**
     * Callback function triggered when the tool is activated.
     * To be implemented in subclasses.
     */
    onActivate(){} 
}
export{DefaultTool};

/**
 * Default toolbar control for the DefaultTool class.
 * Provides image navigation functionality.
 *
 * @class
 * @extends AnnotationUIToolbarBase
 */
class DefaultToolbar extends AnnotationUIToolbarBase{
    /**
     * Create a DefaultToolbar instance associated with the DefaultTool.
     *
     * @constructor
     * @param {DefaultTool} tool - The DefaultTool linked to the toolbar control.
     */
    constructor(tool){
        super(tool);
        /**
         * HTML representation of the button icon for the toolbar.
         * @type {HTMLElement}
         */
        let html = $('<i>',{class:'fa-solid fa-hand'})[0];
        /**
         * Button control for image navigation.
         * @type {OpenSeadragon.Button}
         */
        this.button.configure(html,'Image Navigation Tool');
        
    }
    /**
     * Check whether the toolbar control is enabled for a specific mode.
     *
     * @param {string} mode - The mode to check for enabling.
     * @returns {boolean} True, as the default tool is enabled for all modes.
     */
    isEnabledForMode(mode){
        return true;//enabled for all modes
    }
    
}