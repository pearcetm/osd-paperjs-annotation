import {AnnotationUITool, AnnotationUIToolbarBase} from './annotationUITool.js';
import {PaperOffset} from '../paper-offset.js';
export class BrushTool extends AnnotationUITool{
    constructor(paperScope){
        super(paperScope);
        let self = this;
        let tool = this.tool;
        this.setToolbarControl(new BrushToolbar(this));

        this.eraseMode = false;
        let drawColor = new paper.Color('green');
        let eraseColor= new paper.Color('red');
        drawColor.alpha=0.5;
        eraseColor.alpha=0.5;

        let radius = 0;
        let cursor=new paper.Shape.Circle(new paper.Point(0,0),radius);
        cursor.set({
            strokeWidth:1,
            strokeColor:'black',
            fillColor:drawColor,
            opacity:1,
            visible:false,
        });
        this.pathGroup = new paper.Group([new paper.Path(), new paper.Path()]);
        self.project.toolLayer.addChild(this.pathGroup);
        self.project.toolLayer.addChild(cursor);

        this.extensions.onActivate = function(){
            cursor.radius = radius/self.project.getZoom();
            cursor.strokeWidth=1/self.project.getZoom();
            cursor.visible=true;
            tool.minDistance=3/self.project.getZoom();
            tool.maxDistance=10/self.project.getZoom();
        }
        this.extensions.onDeactivate = function(finished){
            cursor.visible=false;
            if(finished){
                self.finish();
            } 
        }
        this.finish = function(){
            this.deactivate();
        }
        
        this.setRadius=function(r){
            radius = r;
            cursor.radius=r/self.project.getZoom();
        }
        this.setEraseMode=function(erase){
            this.eraseMode=erase;
            cursor.fillColor= erase ? eraseColor : drawColor;
            this.toolbarControl.setEraseMode(this.eraseMode);
        }
        
              
        tool.onMouseDown=function(ev){
            ev.preventDefault();
            ev.stopPropagation();
            
            if(self.itemToCreate){
                self.itemToCreate.initializeGeoJSONFeature('MultiPolygon');
                self.refreshItems();
            }
            
            cursor.position=ev.point;

            let path = new paper.Path([ev.point]);
            path.mode = self.eraseMode ? 'erase' : 'draw';
            path.radius = radius/self.project.getZoom();
            
            self.pathGroup.lastChild.replaceWith(path);
            self.pathGroup.lastChild.set({strokeWidth:cursor.radius*2,fillColor:null,strokeCap:'round'});
            if(path.mode=='erase'){
                self.pathGroup.firstChild.fillColor=eraseColor;
                self.pathGroup.lastChild.strokeColor=eraseColor;        
            }
            else{
                self.pathGroup.firstChild.fillColor=drawColor;
                self.pathGroup.lastChild.strokeColor=drawColor;
            }
        }
        tool.onMouseMove=function(ev){
            cursor.position=ev.point;
        }
        tool.onMouseDrag=function(ev){
            cursor.position=ev.point;
            if(self.item){
                self.pathGroup.lastChild.add(ev.point);
                self.pathGroup.lastChild.smooth({ type: 'continuous' })
            }
        }
        tool.onMouseUp=function(ev){
            self.modifyArea();
        }
        tool.onMouseWheel = function(ev){
            // console.log('Wheel event',ev);
            ev.preventDefault();
            ev.stopPropagation();
            if(ev.deltaY==0) return;//ignore lateral "scrolls"
            self.toolbarControl.updateBrushRadius({larger:ev.deltaY < 0});
        }

        tool.extensions.onKeyDown=function(ev){
            if(ev.key=='e'){
                if(self.eraseMode===false){
                    self.setEraseMode(true);
                }
                else {
                    self.eraseMode='keyhold';
                }
            }
        }
        tool.extensions.onKeyUp=function(ev){
            if(ev.key=='e' && self.eraseMode=='keyhold'){
                self.setEraseMode(false);
            }
        }
    } 
    modifyArea(){
        let path = this.pathGroup.lastChild;
        let shape;
        if(path.segments.length>1){                
            shape = PaperOffset.offsetStroke(path,path.radius,{join:'round',cap:'round',insert:true})
        }
        else{
            shape = new paper.Path.Circle({center: path.firstSegment.point, radius: path.radius });
        }

        shape.strokeWidth = 1/this.project.getZoom();
        shape.strokeColor = 'black'
        shape.fillColor='yellow'
        shape.flatten();
        shape.name='shapeobject';
        if(!this.item.isBoundingElement){
            let boundingItems = this.item.parent.children.filter(i=>i.isBoundingElement);
            shape.applyBounds(boundingItems);
        }

        path.visible=false;
        let result;
        if(this.eraseMode){
            result = this.item.subtract(shape,{insert:false});
        }
        else{
            result = this.item.unite(shape,{insert:false});    
        }
        if(result){
            result=result.toCompoundPath();
            this.item.removeChildren();
            this.item.addChildren(result.children);
            result.remove();     
        }
        shape.remove();
    }  
}

class BrushToolbar extends AnnotationUIToolbarBase{
    constructor(brushTool){
        super(brushTool);
        let html = $('<i>',{class:'fa fa-brush fa-rotate-by',style:'--fa-rotate-angle: 225deg;'})[0];
        this.button.configure(html,'Brush Tool');
        
        let fdd = $('<div>',{'data-tool':'brush',class:'dropdown brush-toolbar'}).appendTo(this.dropdown);
        let defaultRadius = 20;
        $('<label>').text('Radius').appendTo(fdd)
        this.rangeInput=$('<input>',{type:'range',min:1,max:100,value:defaultRadius}).appendTo(fdd).on('change',function(){
                // console.log('Range input changed',$(this).val());
                brushTool.setRadius($(this).val());
            });
        this.eraseButton=$('<button>',{class:'btn btn-secondary','data-action':'erase'}).appendTo(fdd).text('Erase').on('click',function(){
            let erasing = $(this).toggleClass('active').hasClass('active');
            brushTool.setEraseMode(erasing);
        });
        setTimeout(()=>brushTool.setRadius(defaultRadius), 0);
    }
    isEnabledForMode(mode){
        return ['new','MultiPolygon'].includes(mode);
    }
    updateBrushRadius(update){
        if(update.larger){
            this.rangeInput.val(parseInt(this.rangeInput.val())+1).trigger('change');
        }
        else{
            this.rangeInput.val(parseInt(this.rangeInput.val())-1).trigger('change');
        }
    }
    setEraseMode(erasing){
        erasing ? this.eraseButton.addClass('active') : this.eraseButton.removeClass('active');
    }
}