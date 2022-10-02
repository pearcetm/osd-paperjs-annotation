export class ToolBase{
    constructor(project){
        this.project = project;
        this._active=false;
        this._items=[];
        this._item=null;

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
        if(this._active) return;//breaks possible infinite loops of tools activating/deactivating each other
        this._active=true;
        this.getSelectedItems();
        let previousTool=this.project.getActiveTool();
        this.tool.activate();
        this.toolbarControl.activate();//console.log('toolbar control activated')
        previousTool && previousTool != this && previousTool.deactivate(true);
        this.onActivate();
        this.broadcast('activated',{target:this});
    }
    deactivate(finishToolAction){
        if(!this._active) return;//breaks possible infinite loops of tools activating/deactivating each other
        this._active=false;
        this.toolbarControl.deactivate();
        this.onDeactivate(finishToolAction);
        // console.log('Broadcasting deactivated signal',this)
        this.broadcast('deactivated',{target:this}); 
    }
    onActivate(){
        //this.project.viewer.disableMouseHandling();
        this.tool.captureUserInput(true);
        this.project.overlay.addEventListener('wheel',this.tool.onMouseWheel);
        this.project.toolLayer.bringToFront();
        this.extensions.onActivate();
    }
    onDeactivate(shouldFinish=false){
        //this.project.viewer.enableMouseHandling();
        this.tool.captureUserInput(false);
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
    getToolbarControl(){
        return this.toolbarControl;
    }
    setToolbarControl(toolbarControl){
        this.toolbarControl = toolbarControl;
        return this.toolbarControl;
    }
    getSelectedItems(){
        this._items = this.project.paperScope.findSelectedItems();
        this._itemToCreate = this.project.paperScope.findSelectedNewItem();
    }
    selectionChanged(){
        this.getSelectedItems();
        this.onSelectionChanged();
    }
    onSelectionChanged(){}
    get items(){
        return this._items;
    }
    get item(){
        return this._items.length==1 ? this._items[0] : null;
    }
    get itemToCreate(){
        return this._itemToCreate;
    }
}

export class ToolbarBase{
    constructor(tool){
        // let self=this;
        this._active=false;
        this.button=new OpenSeadragon.Button({
            tooltip:'Generic Tool',
            element:$('<button>',{class:'btn invisible'}).text('Generic Tool')[0],
            onClick:function(ev){if(!ev.eventSource.element.disabled) tool._active?tool.deactivate(true):tool.activate()},
        });
        this.button.configure=function(html,tooltip){
            $(this.element).attr('title',tooltip).html(html).removeClass('invisible');
            this.tooltip=tooltip;
        }
        this.dropdown=$('<div>',{class:'dropdown'});
        this.tool = tool;
    }
    isEnabledForMode(mode){
        return false;
    }
    activate(){
        if(this._active) return;
        this._active=true;
        //this.tool.activate();
        $(this.button.element).addClass('active');
        this.dropdown.addClass('active');
    }
    deactivate(shouldFinish){
        if(!this._active) return;
        this._active=false;
        //this.tool.deactivate(shouldFinish);
        $(this.button.element).removeClass('active');
        this.dropdown.removeClass('active');
    }
}