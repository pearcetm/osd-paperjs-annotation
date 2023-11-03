import {ToolBase} from './papertools/base.mjs';
import {DefaultTool} from './papertools/default.mjs';
import {WandTool} from './papertools/wand.mjs';
import {BrushTool} from './papertools/brush.mjs';
import {PointTool} from './papertools/point.mjs';
import {PointTextTool} from './papertools/pointtext.mjs';
import {RectangleTool} from './papertools/rectangle.mjs';
import {EllipseTool} from './papertools/ellipse.mjs';
import {StyleTool} from './papertools/style.mjs';
import {LinestringTool} from './papertools/linestring.mjs';
import {PolygonTool} from './papertools/polygon.mjs';
import {SelectTool} from './papertools/select.mjs';
import {TransformTool} from './papertools/transform.mjs';
import {RasterTool} from './papertools/raster.mjs';




/**
 * A class for creating and managing annotation toolbars
 * @memberof OSDPaperjsAnnotation
 * @class 
 * 
 */
class AnnotationToolbar{
    /**
     * Constructs an AnnotationToolbar instance.
     * @property {Object} ui - The UI object.
     * @property {Object} paperScope - The Paper.js scope object.
     * @property {null|string[]} currentMode - The current mode.
     * @property {null|number} setModeTimeout - The set mode timeout.
     * @property {Object} toolLayer - The tool layer.
     * @property {boolean} toolLayer.isGeoJSONFeatureCollection - A boolean indicating if the tool layer is a GeoJSON feature collection.
     * @property {string} toolLayer.name - The name of the tool layer.
     * @property {ToolConstructors} toolConstructors - An object containing tool constructors.
     * @property {Object.<string, ToolObject>} tools - An object containing tool instances.
     * @param {Object} paperScope - The Paper.js scope object.
     * @param {Array} [tools] - An array of tool names or constructors to use. If not provided, all available tools will be used.
     * @throws {Error} Throws an error if `tools` is provided but is not an array.
     */
    constructor(paperScope, tools){
        // tools should be an array of strings, or null/falsey
        if(tools && !Array.isArray(tools)){
            throw('Bad option: if present, tools must be an Array of tool names or constructors to use.');
        }
        this.ui = makeUI();
        this.paperScope=paperScope;

        this.currentMode = null;
        this.setModeTimeout = null;
        
        let toolLayer=new paperScope.Layer();
        toolLayer.isGeoJSONFeatureCollection=false;
        toolLayer.name = 'toolLayer';
        toolLayer.applyMatrix = false;
        // toolLayer.setScaling(1/toolLayer.view.viewSize.width);
        paperScope.project.addLayer(toolLayer);

        /**
         * 
         * @property {DefaultTool} default - The default tool constructor.
         * @property {SelectTool} select - The select tool constructor.
         * @property {TransformTool} transform - The transform tool constructor.
         * @property {StyleTool} style - The style tool constructor.
         * @property {RectangleTool} rectangle - The rectangle tool constructor.
         * @property {EllipseTool} ellipse - The ellipse tool constructor.
         * @property {PointTool} point - The point tool constructor.
         * @property {PointTextTool} text - The point text tool constructor.
         * @property {PolygonTool} polygon - The polygon tool constructor.
         * @property {BrushTool} brush - The brush tool constructor.
         * @property {WandTool} wand - The wand tool constructor.
         * @property {LinestringTool} linestring - The linestring tool constructor.
         * @property {RasterTool} raster - The raster tool constructor.
         */
        this.toolConstructors = {
            default:DefaultTool,
            select: SelectTool,
            transform: TransformTool,
            style:  StyleTool,
            rectangle: RectangleTool,
            ellipse: EllipseTool,
            point: PointTool,
            text: PointTextTool,
            polygon: PolygonTool,
            brush: BrushTool,
            wand: WandTool,
            linestring : LinestringTool,
            raster: RasterTool,
        }   
        this.tools = {};

        // if array of tools was passed in, use that. Otherwise use all available ones listed in the toolConstructors dictionary
        let toolsToUse = tools || Object.keys(this.toolConstructors);
        // make sure the default tool is always included
        if(toolsToUse.indexOf('default') == -1){
            toolsToUse = ['default', ...toolsToUse];
        }
        toolsToUse.forEach(t => {
            if(typeof t === 'string'){
                if(!this.toolConstructors[t]){
                    console.warn(`The requested tool is invalid: ${t}. No constructor found for that name.`);
                    return;
                }
            } else if(! (t instanceof ToolBase) ){
                console.warn(`${t} must inherit from class ToolBase`);
                return;
            }

            let toolConstructor = (t instanceof ToolBase) ? t : this.toolConstructors[t]

            let toolObj = this.tools[t] = new toolConstructor(this.paperScope);
            let toolbarControl = toolObj.getToolbarControl();
            if(toolbarControl) this.addToolbarControl(toolbarControl);

            // if(toolObj !== tools.default){
            toolObj.addEventListener('deactivated',ev => {
                //If deactivation is triggered by another tool being activated, this condition will fail
                if(ev.target == this.paperScope.getActiveTool()){
                    this.tools.default.activate();
                }
            });
            
        })
        this.tools.default.activate();

        this.setMode();

        //items emit events on the paper project; add listeners to update the toolbar status as needed       
        paperScope.project.on({
            
            'item-replaced':()=>{
                this.setMode();
            },

            'item-selected':()=>{
                this.setMode()
            },
            'item-deselected':()=>{
                this.setMode()
            },
            'item-removed':()=>{
                this.setMode()
            },
            'items-changed':()=>{
                this.setMode();
            }
        });

    }
    
    /**
     * Sets the mode of the toolbar based on the currently selected items in the project. Individual tools will be enabled and disabled by this. If the currently active tool is not supported for the selected item(s) it will be deactivated.
     * 
     */
    setMode() {
        let self = this;
        this.setModeTimeout && clearTimeout(this.setModeTimeout);
        this.setModeTimeout = setTimeout(() => {
            this.setModeTimeout = null;
            let selection = this.paperScope.findSelectedItems();
            let activeTool = this.paperScope.getActiveTool();
            if (selection.length === 0) {
                this.currentMode = 'select';
            } else if (selection.length === 1) {
                let item = selection[0];
                let def = item.annotationItem || {};
                let type = def.type;
                if (def.subtype) type += ':' + def.subtype;
                let mode = type === null ? 'new' : type;
                this.currentMode = mode;
            } else {
                this.currentMode = 'multiselection';
            }
        
            if (activeTool.getToolbarControl().isEnabledForMode(this.currentMode) === false) {
                activeTool.deactivate(true);
                this.tools.default.activate();
            }
        

            Object.values(this.tools).forEach(toolObj => {
                let t = toolObj.getToolbarControl();
                t && (t.isEnabledForMode(self.currentMode) ? t.button.enable() : t.button.disable());
            });
    

            activeTool.selectionChanged();
        }, 0);
    }

/**
 * Adds a toolbar control to the Annotation Toolbar.
 *
 * @param {Object} toolbarControl - The toolbar control to be added.
 * @throws {Error} Throws an error if the toolbar control's button element is not found.
 */    
    addToolbarControl(toolbarControl){
        toolbarControl.button && toolbarControl.button.element && this.ui.buttongroup.buttons.push(toolbarControl.button)
        toolbarControl.dropdown && this.ui.dropdowns.append(toolbarControl.dropdown);
        toolbarControl.isEnabledForMode(this.currentMode) ? toolbarControl.button.enable() : toolbarControl.button.disable();
    }

/**
 * Shows the Annotation Toolbar.
 */
    show(){
        $(this.ui.buttongroup.element).show();
    }
/**
 * Hides the Annotation Toolbar.
 */
    hide(){
        $(this.ui.buttongroup.element).hide();
    }
    
/**
 * Adds the Annotation Toolbar to an OpenSeadragon viewer.
 *
 * @param {Object} viewer - The OpenSeadragon viewer.
 * 
 * This method adds the Annotation Toolbar to an OpenSeadragon viewer. It creates an OpenSeadragon.ButtonGroup with the toolbar buttons and adds it to the OpenSeadragon.ControlAnchor.TOP_LEFT position of the viewer. The `.viewer-controls-topleft` class is added to the viewer controls.
 */
    addToOpenSeadragon(viewer){
        let bg = new OpenSeadragon.ButtonGroup({buttons:this.ui.buttongroup.buttons,element:this.ui.buttongroup.element});
        viewer.addControl(bg.element,{anchor:OpenSeadragon.ControlAnchor.TOP_LEFT});
        // get the new OpenSeadragon.Control object
        this.control = viewer.controls[viewer.controls.length-1];
        this.viewer = viewer;//save reference so we can remove/destroy this toolbar
        let handler = event=>{
            console.log('Mouse nav changed',event);
            // this.control.setVisible(true);
            // if mouse nav is enabled, enable autoFade, otherwise disable
            if(event.overlay == this.paperScope.overlay){
                this.control.autoFade = event.enabled;
            }
        }
        this._mousenavhandler = handler;
        this.viewer.addHandler('mouse-nav-changed',handler);
        $(this.ui.buttongroup.element).append(this.ui.dropdowns);
        $(viewer.controls.topleft).addClass('viewer-controls-topleft');
        $('.toggles .btn').attr('style','');
    }
/**
 * Destroys the Annotation Toolbar.
 *
 */
    destroy(){
        if(this.viewer){
            this.viewer.removeControl(this.ui.buttongroup.element);
            $(this.viewer.controls.topleft).removeClass('viewer-controls-topleft');
            this.viewer.removeHandler(this._mousenavhandler);
        } 
        this.ui.dropdowns.parent().remove();
    } 
}
export {AnnotationToolbar};


/**
 * Creates the user interface for the Annotation Toolbar.
 * @private
 * @returns {Object} The user interface object containing the button group and dropdowns.
 */
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

