import { AnnotationUIToolbarBase } from './annotationUITool.mjs';
import {PolygonTool} from './polygon.mjs';
export class LinestringTool extends PolygonTool{
    constructor(paperScope){
        super(paperScope);
        let self = this;
        let tool = this.tool;   
        
        this.setToolbarControl(new LinestringToolbar(this));
        let lastClickTime=0;
        let drawColor = new paper.Color('green');
        let eraseColor= new paper.Color('red');
        this.radius = 0;
        this.cursor=new paper.Shape.Circle(new paper.Point(0,0),this.radius);
        this.cursor.set({
            strokeWidth:1,
            strokeColor:'black',
            fillColor:drawColor,
            opacity:1,
            visible:false,
        });
        self.project.toolLayer.addChild(this.cursor);

        this.extensions.onActivate= function(){
            self.cursor.radius = self.radius/self.project.getZoom();
            self.cursor.strokeWidth=1/self.project.getZoom();
            self.cursor.visible=true;
            tool.minDistance=4/self.project.getZoom();
            tool.maxDistance=10/self.project.getZoom();
        }
        this.extensions.onDeactivate = function(finished){
            self.cursor.visible=false;
            if(finished){
                self.finish();
            } 
        }
        
        this.setRadius=function(r){
            this.radius = r;
            this.cursor.radius=r/this.project.getZoom();
        }

        // let superOnMouseDown = tool.onMouseDown;
        tool.onMouseDown=function(ev){
            self.draggingSegment=null;

            if(self.itemToCreate){
                self.itemToCreate.initializeGeoJSONFeature('MultiLineString');
                self.refreshItems();
                
                self.startNewPath(ev)
                // console.log('initialized item')
                return;
            }
            
            // self.simplifying && self.cancelSimplify();  
            let dr = self.drawing();
            let hitResult = (dr&&dr.path ||self.item).hitTest(ev.point,{fill:false,stroke:true,segments:true,tolerance:(5/self.project.getZoom())})
            if(hitResult){
                //if erasing and hitResult is a segment, hitResult.segment.remove()
                if(hitResult.type=='segment' && self.eraseMode){
                    hitResult.segment.remove();
                }
                //if hitResult is the last segment and NOT erasing, finish the current path
                else if(hitResult.type=='segment' && dr && hitResult.segment==dr.path.lastSegment){
                    self.finishCurrentPath();
                }
                //if hitResult is a segment and NOT erasing, save reference to hitResult.segment for dragging it
                else if(hitResult.type=='segment'){
                    self.draggingSegment = hitResult.segment;
                }
                //if hitResult is a stroke, add a point (unless in erase mode):
                else if(hitResult.type=='stroke' && !self.eraseMode){
                    let insertIndex = hitResult.location.index +1;
                    let ns = hitResult.item.insert(insertIndex, ev.point);
                }
            }
            else{ //not drawing yet, but start now!
                if(!self.eraseMode) self.startNewPath(ev);
            }
            
        }

        let superOnMouseMove = tool.onMouseMove;
        tool.onMouseMove=function(ev){
            self.cursor.position=ev.point;
            superOnMouseMove(ev);
        }
        let superOnMouseDrag = tool.onMouseDrag;
        tool.onMouseDrag=function(ev){
            self.cursor.position=ev.point;
            superOnMouseDrag(ev);
            let dr = self.drawing();
            dr && (dr.path.segments = self.simplifier.simplify(dr.path.segments.map(s=>s.point)));
        }
        tool.onMouseUp=function(ev){
            self.finishCurrentPath();
        }

        tool.onMouseWheel = function(ev){
            // console.log('Wheel event',ev);
            ev.preventDefault();
            ev.stopPropagation();
            if(ev.deltaY==0) return;//ignore lateral "scrolls"
            // self.project.broadcast('brush-radius',{larger:ev.deltaY > 0});
            self.toolbarControl.updateBrushRadius({larger:ev.deltaY < 0});
        }
    }
    startNewPath(ev){
        this.finishCurrentPath();
        this.drawingGroup.removeChildren();
        this.drawingGroup.addChild(new paper.Path([ev.point]));
        // this.drawing = {path:this.drawingGroup.lastChild, index: 1};
        this.drawingGroup.visible=true;
        this.drawingGroup.selected=true;
        this.drawingGroup.selectedColor= this.eraseMode ? 'red' : null;
        this.drawing().path.set({strokeWidth:this.cursor.radius*2, strokeColor:this.item.strokeColor})
        console.log('started new path')
    }
    //override finishCurrentPath so it doesn't close the path
    finishCurrentPath(){
        if(!this.drawing() || !this.item) return;
        
        let newPath = this.drawing().path;
        if(newPath.segments.length>1){
            this.item.addChild(this.drawing().path);
        }
        this.drawingGroup.removeChildren();
    }
}

class LinestringToolbar extends AnnotationUIToolbarBase{
    constructor(linestringTool){
        super(linestringTool);
        let html = $('<i>',{class:'fa-solid fa-pen-nib'})[0];
        this.button.configure(html,'Linestring Tool');
        
        let fdd = $('<div>',{'data-tool':'linestring',class:'dropdown linestring-toolbar'}).prependTo(this.dropdown);
        let defaultRadius=4;
        $('<label>').text('Set pen width:').appendTo(fdd);
        this.rangeInput=$('<input>',{type:'range',min:.2,max:12,step:0.1,value:defaultRadius}).appendTo(fdd).on('change',function(){
            linestringTool.setRadius($(this).val());
        });
        this.eraseButton=$('<button>',{'data-action':'erase'}).text('Eraser').appendTo(fdd).on('click',function(){
            let erasing = $(this).toggleClass('active').hasClass('active');
            linestringTool.setEraseMode(erasing);
        });
        setTimeout(()=>linestringTool.setRadius(defaultRadius));
    }
    updateBrushRadius(update){
        if(update.larger){
            this.rangeInput.val(parseFloat(this.rangeInput.val())+parseFloat(this.rangeInput.attr('step'))).trigger('change');
        }
        else{
            this.rangeInput.val(parseFloat(this.rangeInput.val())-parseFloat(this.rangeInput.attr('step'))).trigger('change');
        }
    }
    isEnabledForMode(mode){
        return ['new','LineString','MultiLineString'].includes(mode);
    }
    setEraseMode(erasing){
        erasing ? this.eraseButton.addClass('active') : this.eraseButton.removeClass('active');
    }
}