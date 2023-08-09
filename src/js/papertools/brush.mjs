import {AnnotationUITool, AnnotationUIToolbarBase} from './annotationUITool.mjs';
import {PaperOffset} from '../paper-offset.mjs';
/**
 * Represents a Brush Tool in the Annotation Toolkit program.
 * This tool allows users to draw freehand shapes on the canvas and modify existing shapes.
 * @class
 * @memberof OSDPaperjsAnnotation
 * @extends AnnotationUITool
 */
 class BrushTool extends AnnotationUITool{
    /**
   * Create a BrushTool instance.
   * @param {paper.PaperScope} paperScope - The Paper.js PaperScope instance.
   * @property {paper.Tool} tool - The Paper.js tool instance for handling mouse events.
   * @property {boolean} eraseMode - A flag indicating whether the tool is in Erase Mode or Draw Mode.
   * @property {paper.Color} drawColor - The color for drawing strokes.
   * @property {paper.Color} eraseColor - The color for erasing strokes.
   * @property {number} radius - The current radius of the brush tool.
   * @property {paper.Shape.Circle} cursor - The Paper.js Shape.Circle representing the cursor.
   * @property {paper.Group} pathGroup - The Paper.js Group containing the drawing path and the cursor.
   */
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

        /**
         * Event handler for the onActivate event.
         * @inner
         */
        this.extensions.onActivate = function(){
            cursor.radius = radius/self.project.getZoom();
            cursor.strokeWidth=1/self.project.getZoom();
            cursor.visible=true;
            tool.minDistance=3/self.project.getZoom();
            tool.maxDistance=10/self.project.getZoom();
        }
        /**
         * Event handler for the onDeactivate event.
         * @inner
         * @param {boolean} finished - Indicates whether the deactivation was completed.
         */
        this.extensions.onDeactivate = function(finished){
            cursor.visible=false;
            if(finished){
                self.finish();
            } 
        }
        /**
         * Finish the brush tool.
         * @inner
         */
        this.finish = function(){
            this.deactivate();
        }
        /**
         * Set the radius of the brush tool.
         * @inner
         * @param {number} r - The new radius value for the brush.
         */
        this.setRadius=function(r){
            radius = r;
            cursor.radius=r/self.project.getZoom();
        }
        /**
         * Set the erase mode of the brush tool.
         * @inner
         * @param {boolean} erase - A flag indicating whether the tool should be in Erase Mode or Draw Mode.
         */
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

  /**
   * Modify the drawn area based on the brush strokes.
   * This method is responsible for creating the final shape by modifying the drawn area with the brush strokes.
   * @private
   */ 
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
export {BrushTool};

/**
 * Represents the Brush Tool's toolbar in the Annotation Toolkit program.
 * This toolbar provides options to set the brush radius and toggle Erase Mode.
 * @extends AnnotationUIToolbarBase
 * @memberof OSDPaperjsAnnotation
 */
class BrushToolbar extends AnnotationUIToolbarBase{
    /**
   * Create a BrushToolbar instance.
   * @param {BrushTool} brushTool - The parent BrushTool instance.
   */
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
  /**
   * Check if the Brush Tool is enabled for the given mode.
   * @param {string} mode - The current mode of the Annotation Toolkit program.
   * @returns {boolean} A flag indicating if the Brush Tool is enabled for the given mode.
   */
    isEnabledForMode(mode){
        return ['new','MultiPolygon'].includes(mode);
    }
  /**
   * Update the brush radius based on the provided update.
   * @param {Object} update - The update object specifying whether to make the brush radius larger or smaller.
   * @property {boolean} update.larger - A flag indicating whether to make the brush radius larger or smaller.
   */
    updateBrushRadius(update){
        if(update.larger){
            this.rangeInput.val(parseInt(this.rangeInput.val())+1).trigger('change');
        }
        else{
            this.rangeInput.val(parseInt(this.rangeInput.val())-1).trigger('change');
        }
    }
  /**
   * Set the Erase Mode on the toolbar.
   * @param {boolean} erasing - A flag indicating whether the Erase Mode is active or not.
   */
    setEraseMode(erasing){
        erasing ? this.eraseButton.addClass('active') : this.eraseButton.removeClass('active');
    }
}