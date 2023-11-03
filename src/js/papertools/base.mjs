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
        this.project ={
            getZoom:()=>paperScope.view.getZoom(),
            toolLayer:paperScope.project.layers.toolLayer || paperScope.project.activeLayer,
            paperScope:paperScope,
            overlay:paperScope.overlay,
        }
        
        let shiftPressed;
        let self=this;

        this._identityMatrix = new paper.Matrix();
      
        this.extensions = {
            onActivate:()=>{},
            onDeactivate:()=>{}
        }
        this.tool = new paperScope.Tool();
        
        this.tool._toolObject=this; //TODO is _toolObject actually used, and does it need to be?            
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
            self.onKeyDown(ev);
        }
        this.tool.onKeyUp=function(ev){
            if(ev.key=='shift'){
                shiftPressed=false;
                self.onActivate();//start capturing mouse/keyboard events again
            }
            this.extensions.onKeyUp(ev);
            self.onKeyUp(ev);
        }

        this.tool.onMouseDown=function(ev){
            self.onMouseDown(self._transformEvent(ev));
        }
        this.tool.onMouseDrag=function(ev){
            self.onMouseDrag(self._transformEvent(ev));
        }
        this.tool.onMouseMove=function(ev){
            self.onMouseMove(self._transformEvent(ev));
        }
        this.tool.onMouseUp = function(ev){
            self.onMouseUp(self._transformEvent(ev));
        }
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
        this._targetLayer = this.project.paperScope.project.activeLayer;
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

    // default no-op implementations of tool event handlers
    onMouseDown(){}
    onMouseMove(){}
    onMouseDrag(){}
    onMouseUp(){}
    onKeyDown(){}
    onKeyUp(){}

    get targetLayer(){
        return this._targetLayer;
    }

    get targetMatrix(){
        return this.targetLayer ? this.targetLayer.matrix : this._identityMatrix;
    }

    // private
    _transformEvent(ev){
        let matrix = this.targetMatrix;
        let transformed = {
            point: matrix.inverseTransform(ev.point),
            downPoint: matrix.inverseTransform(ev.downPoint),
            lastPoint: matrix.inverseTransform(ev.lastPoint),
            middlePoint: matrix.inverseTransform(ev.middlePoint),
        };
        let deltaStart = ev.point.subtract(ev.delta);
        transformed.delta = transformed.point.subtract(matrix.inverseTransform(deltaStart));

        ev.original = {
            point: ev.point,
            downPoint: ev.downPoint,
            lastPoint: ev.lastPoint,
            middlePoint: ev.middlePoint,
            delta: ev.delta
        };

        Object.assign(ev, transformed);

        return ev;
    }
        
}
export {ToolBase};
