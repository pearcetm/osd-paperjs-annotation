import {ToolBase, ToolbarBase} from './base.js';
export class BrushTool extends ToolBase{
    constructor(project){
        super(project);
        let self = this;
        let tool = this.tool;
        this.setToolbarControl(new BrushToolbar(this));

        let item, dragging;
        let eraseMode = false;
        let drawColor = new paper.Color('green');
        let eraseColor= new paper.Color('red');
        drawColor.alpha=0.5;
        eraseColor.alpha=0.5;

        const PaperOffset = paper.PaperOffset;

        let radius = 0;
        let cursor=new paper.Shape.Circle(new paper.Point(0,0),radius);
        cursor.set({
            strokeWidth:1,
            strokeColor:'black',
            fillColor:drawColor,
            opacity:1,
            visible:false,
        });
        let pathGroup = new paper.Group([new paper.Path(), new paper.Path()]);
        self.project.toolLayer.addChild(pathGroup);
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
            item=dragging=null;
            // this.broadcast('finished');
            this.deactivate();
        }
        
        this.setRadius=function(r){
            radius = r;
            cursor.radius=r/self.project.getZoom();
        }
        this.setEraseMode=function(erase){
            eraseMode=erase;
            cursor.fillColor= erase ? eraseColor : drawColor;
            this.toolbarControl.setEraseMode(eraseMode);
        }
        
        function modifyArea(){
            
            let path = pathGroup.lastChild;
            // path.simplify();
            let shape;
            if(path.segments.length>1){                
                shape = PaperOffset.offsetStroke(path,path.radius,{join:'round',cap:'round',insert:true})
                // console.log(shape)                
            }
            else{
                shape = new paper.Path.Circle({center: path.firstSegment.point, radius: path.radius });
            }

            shape.strokeWidth = 1/self.project.getZoom();
            shape.strokeColor = 'black'
            shape.fillColor='yellow'
            shape.flatten();
            shape.name='shapeobject';
            if(!item.isBoundingElement){
                let boundingItems = item.parent.children.filter(i=>i.isBoundingElement);
                shape.applyBounds(boundingItems);
            }

            path.visible=false;
            let result;
            if(eraseMode){
                result = item.subtract(shape,{insert:false});
            }
            else{
                //result = intersect(poly,item) && item.unite(poly,{insert:false});  
                result = item.unite(shape,{insert:false});    
            }
            if(result){
                result=result.toCompoundPath();
                item.removeChildren();
                item.addChildren(result.children);
                result.remove();
                // console.log('Item modified',item);             
            }
            shape.remove();
        }        
        tool.onMouseDown=function(ev){
            ev.preventDefault();
            ev.stopPropagation();
            
            if(!item){
                item = self.project.initializeItem('Polygon');
            }
            
            dragging=true;
            cursor.position=ev.point;

            let path = new paper.Path([ev.point]);
            path.mode = eraseMode ? 'erase' : 'draw';
            path.radius = radius/self.project.getZoom();
            
            pathGroup.lastChild.replaceWith(path);
            pathGroup.lastChild.set({strokeWidth:cursor.radius*2,fillColor:null,strokeCap:'round'});
            if(path.mode=='erase'){
                pathGroup.firstChild.fillColor=eraseColor;
                pathGroup.lastChild.strokeColor=eraseColor;        
            }
            else{
                pathGroup.firstChild.fillColor=drawColor;
                pathGroup.lastChild.strokeColor=drawColor;
            }
        }
        tool.onMouseMove=function(ev){
            cursor.position=ev.point;
            if(dragging && item){
                pathGroup.lastChild.add(ev.point);
                pathGroup.lastChild.smooth({ type: 'continuous' })
            }
        }
        tool.onMouseUp=function(ev){
            dragging=false;
            modifyArea();
        }
        tool.onMouseWheel = function(ev){
            console.log('Wheel event',ev);
            ev.preventDefault();
            ev.stopPropagation();
            if(ev.deltaY==0) return;//ignore lateral "scrolls"
            // self.project.broadcast('brush-radius',{larger:ev.deltaY > 0});
            self.toolbarControl.updateBrushRadius({larger:ev.deltaY < 0});
        }

        tool.extensions.onKeyDown=function(ev){
            if(ev.key=='e'){
                if(eraseMode===false){
                    self.setEraseMode(true);
                }
                else {
                    eraseMode='keyhold';
                }
            }
        }
        tool.extensions.onKeyUp=function(ev){
            if(ev.key=='e' && eraseMode=='keyhold'){
                self.setEraseMode(false);
            }
        }
    } 
}

class BrushToolbar extends ToolbarBase{
    constructor(brushTool){
        super(brushTool);
        let html = $('<i>',{class:'fa fa-brush fa-rotate-by',style:'--fa-rotate-angle: 225deg;'});
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
        return ['new','Polygon','Polygon:Rectangle','Polygon:Raster'].includes(mode);
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