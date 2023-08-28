/**
 * The ToolBase Class
 * @class
 * @memberof OSDPaperjsAnnotation
 */ 
class ToolBase{
    /**
     * Create a new instance of ToolBase.
     * @param {paper.PaperScope} paperScope - The Paper.js PaperScope object.
     * @memberof OSDPaperjsAnnotation.ToolBase#
     */    
    constructor(paperScope){

        /**
         * The project interface object containing various properties.
         * If a layer in the current project exists that is named "toolLayer" it will be used by the tool for graphical display
         * , the current active layer will be used as the tool layer. 
         * @memberof OSDPaperjsAnnotation.ToolBase#
         * @function projectInterface
         * @property {Function} getZoom - A function to get the current zoom level.
         * @property {paper.Layer} toolLayer - The layer used by the tool for graphical display.
         * @property {paper.PaperScope} paperScope - The Paper.js PaperScope object.
         * @property {Element} overlay - The overlay element used by the tool.
         */
        let projectInterface = this.project ={
            getZoom:()=>paperScope.view.getZoom(),
            toolLayer:paperScope.project.layers.toolLayer || paperScope.project.activeLayer,
            paperScope:paperScope,
            overlay:paperScope.overlay,
        }
        
        let shiftPressed;
        let self=this;
      
        this.extensions = {
            onActivate:()=>{},
            onDeactivate:()=>{}
        }
        this.tool = new paperScope.Tool();
        // console.log('tool created at index',paperScope.tools.indexOf(this.tool),paperScope)
        this.tool._toolObject=this;            
        this.tool.extensions = {
            onKeyUp:()=>{},
            onKeyDown:()=>{},
        }
        this.tool.onKeyDown=function(ev){
            if(!shiftPressed && ev.key==='shift'){
                shiftPressed=true;
                self.onDeactivate();//enable OpenSeadragon event handling for navigation
            }
            this.extensions.onKeyDown(ev);
        }
        this.tool.onKeyUp=function(ev){
            if(ev.key=='shift'){
                shiftPressed=false;
                self.onActivate();//start capturing mouse/keyboard events again
            }
            this.extensions.onKeyUp(ev);
        },
        this.listeners = {}
    }
    /**
     * Check if the tool is active.
     * @returns {boolean} True if the tool is active, otherwise false.
     */    
    isActive(){return this._active; }
    activate(){
        this.tool.activate();
        this.onActivate();
    } 
    deactivate(finishToolAction){
        this.onDeactivate(finishToolAction);
    }
    /**
     * Function called when the tool is activated.
     */    
    onActivate(){
        this.captureUserInput(true);
        this.project.overlay.addEventListener('wheel',this.tool.onMouseWheel);
        this.project.toolLayer.bringToFront();
        this.extensions.onActivate();
    }
    /**
     * Function called when the tool is deactivated.
     * @param {boolean} [shouldFinish=false] - Indicates whether the tool should finish its action.
     */    
    onDeactivate(shouldFinish=false){
        this.captureUserInput(false);
        this.project.overlay.removeEventListener('wheel',this.tool.onMouseWheel);
        this.project.toolLayer.sendToBack(); 
        this.extensions.onDeactivate(shouldFinish);
    }
    /**
     * Add an event listener for a specific event type.
     * @param {string} eventType - The type of event to listen for.
     * @param {Function} callback - The callback function to be executed when the event occurs.
     */    
    addEventListener(eventType,callback){
        this.listeners[eventType] = this.listeners[eventType]||[];
        this.listeners[eventType].push(callback);
    }
    /**
     * Broadcast an event to all registered event listeners for the specified event type.
     * @param {string} eventType - The type of event to broadcast.
     * @param {...*} data - Data to be passed as arguments to the event listeners.
     */    
    broadcast(eventType,...data){
        let listeners = this.listeners[eventType];
        listeners && listeners.forEach(l=>l(...data));
    }
    
    /**
     * Capture user input to enable or disable OpenSeadragon mouse navigation.
     * @memberof OSDPaperjsAnnotation.ToolBase
     * @inner
     * @param {boolean} [capture=true] - Set to true to capture user input, false to release it.
     */    
    captureUserInput(capture = true) { 
        this.project.overlay.setOSDMouseNavEnabled(!capture);
    };
        
}
export {ToolBase};
