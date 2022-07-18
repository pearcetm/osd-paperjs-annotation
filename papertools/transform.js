import {ToolBase, ToolbarBase} from './base.js';
export class TransformTool extends ToolBase{
    constructor(project){
        super(project);
        let self=this;
        this.ps = this.project.paperScope;
        this._mode = 'select';
        this._moving = [];
        this.setToolbarControl(new TransformToolbar(this));
        this.makeTransformToolObject(project.getZoom());
        
        this.extensions.onActivate=function(){ 
            self.project.viewer.addHandler('canvas-click',self.clickHandler) 
            self.tool.onMouseMove = (ev)=>self.onMouseMove(ev);
        }    
        this.extensions.onDeactivate=function(shouldFinish){
            self.project.viewer.removeHandler('canvas-click',self.clickHandler);
            self.project.paperScope.view.removeClass('selectable-layer');
            self.tool.onMouseMove = null;
            if(shouldFinish){
                self.disableTransformToolObject();
            }
        }
        this.tool.extensions.onKeyUp=function(ev){
            //console.log(`Key up on ${ev.key} key`)
            if(ev.key=='escape'){
                let item=self.project.findSelectedItem();
                item && item.deselect();
            }
        }
        // this.clickHandler = (ev)=>self.onClick(ev);
        // this.tool.onMouseDown=function(ev){
        //     if(self._mode !== 'transform') return;

        //     let hitResult = self.hitTest(ev.point);
        //     if(!hitResult) return;

        //     let currentItems = self.getSelectedItems();
        //     if(currentItems.indexOf(hitResult.item)>-1){
        //         // self._moving=currentItems;
        //         // console.log(self._moving)
        //     }
        // }
        this.tool.onMouseUp=function(ev){
            if(self._mode !== 'select') return;
            if(ev.downPoint.subtract(ev.point).length>0) return;
            //not a click-and-drag, do element selection
            let hitResult = self.hitTest(ev.point);
            if(!hitResult) return;
            self.toggleItemSelection(hitResult.item,(ev.modifiers.control || ev.modifiers.meta))
        }
    }
    getSelectedItems(){
        return this.ps.project.selectedItems.filter(i=>i.isAnnotationFeature);
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
    setMode(mode){
        this._mode = mode;
        this.toolbarControl.setMode(mode);
        mode=='transform' ? this.enableTransformToolObject() : this.disableTransformToolObject();
    }
    makeTransformToolObject(currentZoom){
        let self=this;
        let cSize=12;//control size
             
        if(this._transformTool) this._transformTool.remove();
        this._transformTool = new paper.Group();
        
        this.project.toolLayer.addChild(this._transformTool);
        this._transformTool.applyMatrix=false;
        this._transformTool.transforming=[];
        this._transformTool.boundingRect = new paper.Shape.Rectangle(new paper.Point(0,0), new paper.Size(0,0));
        this._transformTool.boundingDisplay = new paper.Shape.Rectangle(new paper.Point(0,0), new paper.Size(0,0));
        this._transformTool.boundingRect.set({strokeWidth:0,fillColor:new paper.Color(0,0,0,0.001)});
        this._transformTool.boundingDisplay.set({strokeWidth:5,strokeColor:'lightblue',rescale:{strokeWidth:5}});
        this._transformTool.addChild(this._transformTool.boundingRect);
        this._transformTool.addChild(this._transformTool.boundingDisplay);
        
        //Resize operations
        this._transformTool.corners=[
         ['topLeft','bottomRight'],
         ['topRight','bottomLeft'],
         ['bottomRight','topLeft'],
         ['bottomLeft','topRight']].reduce((acc,c)=>{
             let ctrl = new paper.Shape.Rectangle(new paper.Point(0,0),new paper.Size(cSize/currentZoom,cSize/currentZoom));
            //  let refPt = new paper.Shape.Circle(new paper.Point(0,0),1);
            //  refPt.visible=false;
            //  ctrl.refPt = refPt;
             ctrl.set({rescale:{size:z=>new paper.Size(cSize/z, cSize/z)},fillColor:'red',strokeColor:'black'});
             self._transformTool.addChild(ctrl);
            //  self._transformTool.addChild(refPt);
             ctrl.anchor=c[0];
             ctrl.opposite=c[1];
             ctrl.onMouseDown = function(ev){ev.stopPropagation();}
             ctrl.onMouseDrag = function(ev){
                let rotation=this.parent.rotation
                let delta=ev.delta.rotate(-rotation);
                let refPosX = this.parent.matrix.inverseTransform(this.parent.corners[this.opposite].refPos);
                // let refPosX = this.parent.matrix.inverseTransform(this.parent.corners[this.opposite].refPt.position);
                let refPos = this.parent.corners[this.opposite].position;
                // console.log(refPos,refPos2)
                // let refPos = this.parent.matrix.transform(this.parent.corners[this.opposite].position);
                let thisPos = this.position;
                let newPos = this.position.add(delta);
                let oldSize=new paper.Rectangle(refPos,thisPos).size;
                let newSize=new paper.Rectangle(refPos,newPos).size;
                let sf = newSize.divide(oldSize);

                this.parent.transforming.forEach( item=>{
                    item.matrix.append(new paper.Matrix().scale(sf.width,sf.height,refPosX));
                });
                // Object.values(this.parent.corners).forEach( corner=>{
                //     corner.refPt.scale(sf.width,sf.height,refPosX);
                // });
                
                this.parent.boundingRect.scale(sf.width,sf.height,refPos);
                this.parent.setBounds(true);
             }
             acc[c[0]]=ctrl;
             return acc;
         },{});

        //Rotation operations
        this._transformTool.rotationHandle=new paper.Shape.Circle(new paper.Point(0,0),cSize/currentZoom);
        this._transformTool.rotationHandle.set({fillColor:'red',strokeColor:'black',rescale:{radius:cSize}});
        this._transformTool.addChild(this._transformTool.rotationHandle);
        this._transformTool.rotationHandle.onMouseDown = function(ev){ev.stopPropagation();}
        this._transformTool.rotationHandle.onMouseDrag = function(ev){
            let parentMatrix=this.parent.matrix;
            let center=parentMatrix.transform(this.parent.boundingRect.position);
            
            let oldVec = ev.point.subtract(ev.delta).subtract(center);
            let newVec = ev.point.subtract(center);
            let angle = newVec.angle - oldVec.angle;
            this.parent.rotate(angle,center);
            this.parent.transforming.forEach(item=>{item.rotate(angle,center); })
            Object.values(this.parent.corners).forEach(corner=>{
                corner.refPos = corner.refPos.rotate(angle,center);
            })
        }

        //Translation operations
        this._transformTool.onMouseDown = function(ev){
            // console.log('mousedown',ev);
            let hitresult=self.hitTest(ev.point) || this.boundingDisplay.hitTest(this.matrix.inverseTransform(ev.point));
            hitresult = hitresult && (hitresult.item==this.boundingDisplay || (hitresult.item.isAnnotationFeature&&hitresult.item.selected) );
            // console.log('hit',hitresult);
            if(hitresult) this._dragging=true;
        }
        this._transformTool.onMouseUp = function(ev){
            this._dragging=false;
        }
        this._transformTool.onMouseDrag = function(ev){
            if(!this._dragging) return;
            this.translate(ev.delta);
            Object.values(this.corners).forEach(corner=>{
                corner.refPos = corner.refPos.add(ev.delta);
            })
            this.transforming.forEach(item=>item.translate(ev.delta));
        }

        //(re)positioning the tool handles (corners, rotation control)
        this._transformTool.setBounds=function(useExistingBoundingRect=false){
            if(!useExistingBoundingRect){
                let bounds=this.transforming.reduce((acc,item)=>{
                    acc.minX = acc.minX===null?item.bounds.topLeft.x : Math.min(acc.minX,item.bounds.topLeft.x);
                    acc.minY = acc.minY===null?item.bounds.topLeft.y : Math.min(acc.minY,item.bounds.topLeft.y);
                    acc.maxX = acc.maxX===null?item.bounds.bottomRight.x : Math.max(acc.maxX,item.bounds.bottomRight.x);
                    acc.maxY = acc.maxY===null?item.bounds.bottomRight.y : Math.max(acc.maxY,item.bounds.bottomRight.y);
                    return acc;
                },{minX:null,minY:null,maxX:null,maxY:null});
                let rect = new paper.Rectangle(new paper.Point(bounds.minX,bounds.minY), new paper.Point(bounds.maxX,bounds.maxY));
                this.matrix.reset();
                this.boundingRect.set({position:rect.center,size:rect.size});
                // this.transforming.forEach(item=>item.rotationAxis=new paper.Point(rect.center));
            }
            
            let br=this.boundingRect;
            this.boundingDisplay.set({position:br.position,size:br.bounds.size});
            Object.values(this.corners).forEach(c=>{
                c.position=br.bounds[c.anchor];
                // if(!useExistingBoundingRect) c.refPt.position = c.position;
                if(!useExistingBoundingRect) c.refPos = c.position;
            })
            this.rotationHandle.set({
                position:br.position.subtract(new paper.Point(0,br.bounds.size.height/2+this.rotationHandle.radius*2))
            });
        }



        this._transformTool.transformItems=function(items){
            //finish applying all transforms to previous items (called during disableTransformToolObject)
            this.transforming.forEach(item=>{
                item.matrix.apply(true,true);
            })

            //set up new objects for transforming, and reset matrices of the tool
            this.transforming=items;
            items.forEach(item=>item.applyMatrix=false)
            this.matrix.reset();
            this.boundingRect.matrix.reset();
            this.boundingDisplay.matrix.reset();
            this.setBounds();
        }
        this._transformTool.visible=false;
    }
    enableTransformToolObject(){
        this.project.toolLayer.bringToFront();
        this._transformTool.visible=true;
        this._transformTool.transformItems(this.getSelectedItems());
        
    }
    disableTransformToolObject(){
        this.project.toolLayer.sendToBack();
        this._transformTool.transformItems([]);
        this._transformTool.visible=false;
    }
    selectionChanged(){
        if(this._mode=='transform'){
            this.enableTransformToolObject();
        }
    }
    // onClick(ev){
    //     // this function handles OSD click events when handling is enabled on the viewer
    //     let coords = this.project.viewer.viewport.viewerElementToImageCoordinates(ev.position);
    //     let hitResult = this.hitTest(coords);
    //     if(!hitResult) return;
    //     // if( hitResult.item.select && !hitResult.item.selected){
    //         // this.toggleItemSelection(hitResult.item,(ev.originalEvent.metaKey || ev.originalEvent.ctrlKey))//.select();
    //         // console.log('Selecting',hitResult.item)
    //     // }
    // }
    onMouseMove(ev){
        if(this._mode == 'transform'){
            // this._moving.forEach(i=>i.position=i.position.add(ev.delta));
        }
        else if(ev.item){
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
    hitTest(coords){
        let hitResult = this.ps.project.hitTest(coords,{
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
}

class TransformToolbar extends ToolbarBase{
    constructor(tool){
        super(tool);
        this.dropdown.addClass('transform-dropdown');
        this.button.configure('Pick and transform','Transform Tool');
        this.modeRow = $('<div>',{class:'mode-buttons','data-mode':'select'}).appendTo(this.dropdown);

        let s = $('<div>',{'data-active':'select'}).appendTo(this.modeRow)
        $('<span>').text('(Ctrl)click to select items.').appendTo(s);
        $('<button>').text('Enable transform mode').appendTo(s).on('click',function(){
            tool.setMode('transform');
        });

        let t = $('<div>',{'data-active':'transform'}).appendTo(this.modeRow)
        $('<span>').text('Move, scale, or rotate').appendTo(t);
        $('<button>').text('Enable selection mode').appendTo(t).on('click',function(){
            tool.setMode('select');
        });
        
    }
    isActiveForMode(mode){
        return ['transform','Polygon','Polygon:Rectangle','Point','LineString','Polygon:Raster'].includes(mode);
    }
    setMode(mode){
        this.modeRow.attr('data-mode',mode);
    }
}