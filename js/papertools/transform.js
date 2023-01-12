import {AnnotationUITool, AnnotationUIToolbarBase} from './annotationUITool.js';
export class TransformTool extends AnnotationUITool{
    constructor(paperScope){
        super(paperScope);
        let self=this;
        this.ps = this.project.paperScope;
        this._mode = 'transform';
        this._moving = [];
        this.setToolbarControl(new TransformToolbar(this));
        this.makeTransformToolObject(self.project.getZoom());
        
        this.extensions.onActivate=function(){ 
            // self.project.viewer.addHandler('canvas-click',self.clickHandler) 
            self.enableTransformToolObject();
        }    
        this.extensions.onDeactivate=function(shouldFinish){
            // self.project.viewer.removeHandler('canvas-click',self.clickHandler);
            self.tool.onMouseMove = null;
            if(shouldFinish){
                self.disableTransformToolObject();
            }
        }
    }
    // getSelectedItems(){
    //     return this.ps.project.selectedItems.filter(i=>i.isGeoJSONFeature);
    // }
    
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
                let rotation=this.parent.rotation;
                let delta=ev.delta.rotate(-rotation);
                
                let refPos = this.parent.corners[this.opposite].position;

                if(ev.modifiers.command || ev.modifiers.control){
                    delta = delta.project(this.position.subtract(refPos));
                }
                
                let oldPos = this.position;
                let newPos = this.position.add(delta);
                let oldSize=new paper.Rectangle(refPos,oldPos).size;
                let newSize=new paper.Rectangle(refPos,newPos).size;
                let sf = newSize.divide(oldSize);
                
                let refPosX = refPos.transform(this.parent.matrix);
                let refPosZ = this.parent.matrix.inverseTransform(this.parent.corners[this.opposite].refPos);

                this.parent.transforming.forEach( item=>{
                    let matrix = new paper.Matrix().scale(sf.width,sf.height,refPosZ); 
                    item.matrix.append(matrix);
                    item.onTransform && item.onTransform('scale', refPosX, rotation, matrix);
                });
                
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
            this.parent.transforming.forEach(item=>{
                item.rotate(angle,center);
                item.onTransform && item.onTransform('rotate', angle, center);
            })
            Object.values(this.parent.corners).forEach(corner=>{
                corner.refPos = corner.refPos.rotate(angle,center);
            })
        }

        //Translation operations
        this._transformTool.onMouseDown = function(ev){
            // console.log('mousedown',ev);
            let hitresult=self.hitTest(ev.point) || this.boundingDisplay.hitTest(this.matrix.inverseTransform(ev.point));
            hitresult = hitresult && (hitresult.item==this.boundingDisplay || (hitresult.item.isGeoJSONFeature&&hitresult.item.selected) );
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
            this.transforming.forEach(item=>{
                item.translate(ev.delta);
                item.onTransform && item.onTransform('translate', ev.delta);
            });
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
                item.onTransform && item.onTransform('complete');
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
        this._transformTool.transformItems(this.items);
        // this._transformTool.transformItems(this.getSelectedItems());
        
    }
    disableTransformToolObject(){
        this.project.toolLayer.sendToBack();
        this._transformTool.transformItems([]);
        this._transformTool.visible=false;
    }
    hitTest(coords){
        let hitResult = this.ps.project.hitTest(coords,{
            fill:true,
            stroke:true,
            segments:true,
            tolerance:(5/this.project.getZoom()),
            match:i=>i.item.isGeoJSONFeature || i.item.parent.isGeoJSONFeature,
        })
        if(hitResult && !hitResult.item.isGeoJSONFeature){
            hitResult.item = hitResult.item.parent;
        }
        return hitResult;
    }
}

class TransformToolbar extends AnnotationUIToolbarBase{
    constructor(tool){
        super(tool);
        $(this.dropdown).addClass('transform-dropdown');
        let html = $('<i>',{class:'fa-solid fa-up-down-left-right'})[0];
        this.button.configure(html,'Transform Tool');
        
    }
    isEnabledForMode(mode){
        return this.tool.project.paperScope.findSelectedItems().length>0 && [
            'select',
            'multiselection',
            'MultiPolygon',
            'Point:Rectangle',
            'Point:Ellipse',
            'Point',
            'LineString',
            'GeometryCollection:Raster',
        ].includes(mode);
    }
    
}