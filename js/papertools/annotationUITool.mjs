import {ToolBase} from './base.mjs';

export class AnnotationUITool extends ToolBase{
    constructor(paperScope){
        super(paperScope)
        
        this._active=false;
        this._items=[];
        this._item=null;

    }
    
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
    deactivate(finishToolAction){
        if(!this._active) return;//breaks possible infinite loops of tools activating/deactivating each other
        this._active=false;
        this.toolbarControl.deactivate();

        this.onDeactivate(finishToolAction);
        this.broadcast('deactivated',{target:this}); 
    }
    getToolbarControl(){
        return this.toolbarControl;
    }
    setToolbarControl(toolbarControl){
        this.toolbarControl = toolbarControl;
        return this.toolbarControl;
    }
    refreshItems(){
        return this.getSelectedItems();
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

export class AnnotationUIToolbarBase{
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
    isEnabledForMode(mode){
        return false;
    }
    activate(){
        if(this._active) return;
        this._active=true;
        //this.tool.activate();
        this.button.element.classList.add('active');
        this.dropdown.classList.add('active');
    }
    deactivate(shouldFinish){
        if(!this._active) return;
        this._active=false;
        //this.tool.deactivate(shouldFinish);
        this.button.element.classList.remove('active');
        this.dropdown.classList.remove('active');
    }
}