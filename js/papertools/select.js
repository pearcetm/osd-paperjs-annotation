import {ToolBase, ToolbarBase} from './base.js';
export class SelectTool extends ToolBase{
    constructor(project){
        super(project);
        let self=this;
        this.ps = this.project.paperScope;
        this.setToolbarControl(new SelectToolbar(this));

        let selectionRectangle = new paper.Path.Rectangle({strokeWidth:2,rescale:{strokeWidth:2},strokeColor:'black'});
        let sr2 = new paper.Path.Rectangle({strokeWidth:2,dashArray:[10,10],rescale:{strokeWidth:2,dashArray:[10,10]},strokeColor:'white'});
        this.ps.project.layers.toolLayer.addChild(selectionRectangle);
        this.ps.project.layers.toolLayer.addChild(sr2);
        selectionRectangle.applyRescale();
        sr2.applyRescale();
        selectionRectangle.visible=false;
        sr2.visible=false;
        
        this.extensions.onActivate=function(){ 
            self.project.viewer.addHandler('canvas-click',self.clickHandler) 
            self.tool.onMouseMove = (ev)=>self.onMouseMove(ev);
        }    
        this.extensions.onDeactivate=function(shouldFinish){
            self.project.viewer.removeHandler('canvas-click',self.clickHandler);
            self.project.paperScope.view.removeClass('selectable-layer');
            self.tool.onMouseMove = null;
        }
        this.tool.extensions.onKeyUp=function(ev){
            if(ev.key=='escape'){
                self.project.findSelectedItems().forEach(item=>item.deselect());
            }
        }
       
        this.tool.onMouseUp=function(ev){
            selectionRectangle.visible=false;
            sr2.visible=false;
            if(ev.downPoint.subtract(ev.point).length==0){
                //not a click-and-drag, do element selection
                let hitResult = self.hitTestPoint(ev);
                if(!hitResult) return;
                self.toggleItemSelection(hitResult.item,(ev.modifiers.control || ev.modifiers.meta))
            }
            else{
                //click and drag, do area-based selection
                let hitResults = self.hitTestArea(ev);
                let keepExistingSelection = (ev.modifiers.control || ev.modifiers.meta);
                if(!keepExistingSelection){
                    self.project.findSelectedItems().forEach(item=>item.deselect());
                }
                hitResults.forEach(item=>item.select())
            }
        }
        this.tool.onMouseDrag = function(ev){
            selectionRectangle.visible=true;
            sr2.visible=true;
            let r=new paper.Rectangle(ev.downPoint,ev.point);
            selectionRectangle.set({segments:[r.topLeft, r.topRight, r.bottomRight, r.bottomLeft]});
            sr2.set({segments:[r.topLeft, r.topRight, r.bottomRight, r.bottomLeft]});
            console.log(selectionRectangle.visible, selectionRectangle.segments)
        }
    }
    getSelectedItems(){
        return this.ps.project.selectedItems.filter(i=>i.isAnnotationFeature);
    }
    doAnnotationItemsExist(){
        return this.ps.project.getItems({match:i=>i.isAnnotationFeature}).length>0; 
    }
    toggleItemSelection(item,keepCurrent){
        let itemIsSelected = item.selected;
        if(itemIsSelected && (keepCurrent || this.getSelectedItems().length==1)){
            item.selected=false;
            item.deselect();
        }
        else{
            !keepCurrent && this.getSelectedItems().forEach(item=>item.deselect());
            item.select();
        }
    }
    toggleLayerSelection(layer,keepCurrent){
        if(layer.layerSelected){
            layer.layerSelected=false;
            layer.deselect(false);
            console.log('called layer.deselect()')
        }
        else{
            layer.layerSelected=true;
            layer.select(false);
            console.log('called layer.select()')
        }
    }
    
    onMouseMove(ev){
        if(ev.item){
            if(this.item != ev.item) (ev.item.emit('selection:mouseenter')||true) 
            if(this.layer != ev.item.layer) ev.item.layer.emit('selection:mouseenter');
            this.item = ev.item;
            this.layer = this.item.layer;
            this.ps.view.addClass('selectable-layer')
        }
        else{
            this.item && (this.item.emit('selection:mouseleave',ev)||true) 
            this.layer && this.layer.emit('selection:mouseleave',ev);
            this.ps.view.removeClass('selectable-layer')
            this.item = null;
            this.layer = null;
        }   
    }
    hitTestPoint(ev){
        let hitResult = this.ps.project.hitTest(ev.point,{
            fill:true,
            stroke:true,
            segments:true,
            tolerance:(5/this.project.getZoom()),
            match:i=>i.item.isAnnotationFeature || i.item.parent.isAnnotationFeature,
        })
        if(hitResult && !hitResult.item.isAnnotationFeature){
            hitResult.item = hitResult.item.parent;
        }
        return hitResult;
    }
    hitTestArea(ev,onlyFullyContained){
        let options = {
            match:item=>item.isAnnotationFeature,// || i.item.parent.isAnnotationFeature,
        }
        let testRectangle=new paper.Rectangle(ev.point,ev.downPoint);
        if(onlyFullyContained){
            options.inside=testRectangle;
        }
        else{
            options.overlapping=testRectangle;
        }
        let hitResult = this.ps.project.getItems(options);
        return hitResult;
    }
}

class SelectToolbar extends ToolbarBase{
    constructor(tool){
        super(tool);
        this.dropdown.addClass('select-dropdown');
        let html = $('<i>',{class:'fa-solid fa-arrow-pointer'});
        this.button.configure(html,'Selection Tool');
        
        let s = $('<div>',{'data-active':'select'}).appendTo(this.modeRow)
        $('<span>').text('(Ctrl)click to select items.').appendTo(s);
        
    }
    isEnabledForMode(mode){
        let itemsExist = this.tool.doAnnotationItemsExist();
        return itemsExist && ['default','select','Polygon','Polygon:Rectangle','Point','LineString','Polygon:Raster'].includes(mode);
    }
    
}