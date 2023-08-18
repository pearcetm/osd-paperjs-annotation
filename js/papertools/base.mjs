export class ToolBase{
    constructor(paperScope){
        //If a layer in the current project exists that is named "toolLayer" it will be used by the tool for graphical display
        //Otherwise, the current active layer will be used as the tool layer.
        
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
    isActive(){return this._active; }
    activate(){
        this.tool.activate();
        this.onActivate();
    }
    deactivate(finishToolAction){
        this.onDeactivate(finishToolAction);
    }
    onActivate(){
        this.captureUserInput(true);
        this.project.overlay.addEventListener('wheel',this.tool.onMouseWheel);
        this.project.toolLayer.bringToFront();
        this.extensions.onActivate();
    }
    onDeactivate(shouldFinish=false){
        this.captureUserInput(false);
        this.project.overlay.removeEventListener('wheel',this.tool.onMouseWheel);
        this.project.toolLayer.sendToBack(); 
        this.extensions.onDeactivate(shouldFinish);
    }
    addEventListener(eventType,callback){
        this.listeners[eventType] = this.listeners[eventType]||[];
        this.listeners[eventType].push(callback);
    }
    broadcast(eventType,...data){
        let listeners = this.listeners[eventType];
        listeners && listeners.forEach(l=>l(...data));
    }
    
    
    captureUserInput(capture = true) { 
        this.project.overlay.setOSDMouseNavEnabled(!capture);
    };
        
}
