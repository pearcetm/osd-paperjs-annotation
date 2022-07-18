export class ToolBase{
    constructor(project){
        this.project = project;
        this._active=false;
        let shiftPressed;
        let self=this;
        this.extensions = {
            onActivate:()=>{},
            onDeactivate:()=>{}
        }
        this.tool = new paper.Tool();
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
        this.setToolbarControl(new ToolbarBase(this));
    }
    isActive(){return this._active; }
    activate(){
        if(this._active) return;
        this._active=true;
        let activeTool=this.project.getActiveTool();
        activeTool && activeTool != this && activeTool.deactivate(true);
        this.tool.activate();
        this.toolbarControl.activate();
        this.onActivate();
        this.broadcast('activated',{target:this}); 
    }
    deactivate(finishToolAction){
        if(!this._active) return;
        this._active=false;
        this.toolbarControl.deactivate();
        this.onDeactivate(finishToolAction);
        this.broadcast('deactivated',{target:this,finished:finishToolAction}); 
    }
    onActivate(){
        this.project.viewer.disableMouseHandling();
        this.project.canvasEl.addEventListener('wheel',this.tool.onMouseWheel);
        this.project.toolLayer.bringToFront();
        this.extensions.onActivate();
    }
    onDeactivate(shouldFinish=false){
        this.project.viewer.enableMouseHandling();
        this.project.canvasEl.removeEventListener('wheel',this.tool.onMouseWheel);
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
    getToolbarControl(){
        return this.toolbarControl;
    }
    setToolbarControl(toolbarControl){
        this.toolbarControl = toolbarControl;
        return this.toolbarControl;
    }
    selectionChanged(){}
}

export class ToolbarBase{
    constructor(tool){
        let self=this;
        this._active=false;
        this.button=new OpenSeadragon.Button({
            tooltip:'Generic Tool',
            element:$('<button>',{class:'btn invisible'}).text('Generic Tool')[0],
            onClick:()=>self._active?self.deactivate(true):self.activate(),
        });
        this.button.configure=function(display,tooltip){
            $(this.element).attr('title',tooltip).html(display).removeClass('invisible');
            this.tooltip=tooltip;
        }
        this.dropdown=$('<div>',{class:'dropdown'});
        this.tool = tool;
    }
    isActiveForMode(mode){
        return false;
    }
    activate(){
        if(this._active) return;
        this._active=true;
        this.tool.activate();
        $(this.button.element).addClass('active');
        this.dropdown.addClass('active');
    }
    deactivate(shouldFinish){
        if(!this._active) return;
        this._active=false;
        this.tool.deactivate(shouldFinish);
        $(this.button.element).removeClass('active');
        this.dropdown.removeClass('active');
    }
}