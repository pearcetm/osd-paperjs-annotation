import { AnnotationUIToolbarBase } from './annotationUITool.mjs';
import {PolygonTool} from './polygon.mjs';

/**
 * The LinestringTool class extends the PolygonTool and provides functionality for creating and modifying linestrings.
 * @extends PolygonTool
 * @class
 * @memberof OSDPaperjsAnnotation
 */
class LinestringTool extends PolygonTool{
    /**
    * The constructor initializes the LinestringTool by calling the base class (PolygonTool) constructor and sets up the necessary toolbar control (LinestringToolbar).
    * @memberof OSDPaperjsAnnotation.LinestringTool
    * @constructor
    * @param {paper.PaperScope} paperScope - The Paper.js scope for the tool.
    * @property {paper.Shape.Circle} cursor - The cursor representing the pen for drawing linestrings. It is a Paper.js Circle shape.
    * @property {number} radius - The brush radius for drawing linestrings. This property controls the width of the linestring paths.
    * @property {paper.Path} draggingSegment - The segment that is being dragged during the mouse drag event. It is a Paper.js Path representing the segment.
    */
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
        /**
         * Set the brush radius for the linestring tool.
         * This function updates the brush radius used for drawing linestrings.
         * The new radius is adjusted according to the current zoom level.
         * @param {number} r - The new brush radius value to set.
         * 
         */        
        this.setRadius=function(r){
            this.radius = r;
            this.cursor.radius=r/this.project.getZoom();
        }

        // let superOnMouseDown = tool.onMouseDown;
        /**
         * Handle the mouse down event for the linestring tool.
         * This function is called when the user presses the mouse button.
         * It checks for hit items and decides whether to start a new path, delete a segment, or add a new point.
         * @private
         * @param {paper.MouseEvent} ev - The mouse event containing the click information.
         */
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
        /**
         * Handle the mouse move event for the linestring tool.
         * This function is called when the user moves the mouse.
         * It updates the position of the cursor representing the pen and performs any necessary operations during the mouse move.
         * @private
         * @param {paper.MouseEvent} ev - The mouse event containing the move information.
         */
        tool.onMouseMove=function(ev){
            self.cursor.position=ev.point;
            superOnMouseMove(ev);
        }
        let superOnMouseDrag = tool.onMouseDrag;
        /**
         * Handle the mouse drag event for the linestring tool.
         * This function is called when the user drags the mouse.
         * It updates the position of the cursor representing the pen and modifies the linestring path during the drag operation.
         * @private
         * @param {paper.MouseEvent} ev - The mouse event containing the drag information.
         */
        tool.onMouseDrag=function(ev){
            self.cursor.position=ev.point;
            superOnMouseDrag(ev);
            let dr = self.drawing();
            dr && (dr.path.segments = self.simplifier.simplify(dr.path.segments.map(s=>s.point)));
        }
        /**
         * Handle the mouse up event for the linestring tool.
         * This function is called when the user releases the mouse button.
         * It finishes the current linestring path if one is being drawn.
         * @private
         * @param {paper.MouseEvent} ev - The mouse event containing the release information.
         */
        tool.onMouseUp=function(ev){
            self.finishCurrentPath();
        }
        /**
         * Handle the mouse wheel event for the linestring tool.
         * This function is called when the user scrolls the mouse wheel.
         * It updates the brush radius based on the scroll direction to make drawing thicker or thinner lines easier.
         * @private
         * @param {WheelEvent} ev - The wheel event containing the scroll information.
         */
        tool.onMouseWheel = function(ev){
            // console.log('Wheel event',ev);
            ev.preventDefault();
            ev.stopPropagation();
            if(ev.deltaY==0) return;//ignore lateral "scrolls"
            // self.project.broadcast('brush-radius',{larger:ev.deltaY > 0});
            self.toolbarControl.updateBrushRadius({larger:ev.deltaY < 0});
        }
    }
    /**
     * Start a new linestring path when the user clicks the mouse.
     * This function initializes the creation of a new linestring path, sets up a drawing group to hold the path, and listens for user mouse events to add new points to the path.
     * @function startNewPath
     * @memberof OSDPaperjsAnnotation.LinestringTool#
     * @param {paper.MouseEvent} ev - The mouse event containing the click information.
     */
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
    /**
     * Finish the current linestring path when the user releases the mouse.
     * This function finalizes the current linestring path by adding it to the main item and clears the drawing group.
     * @function finishCurrentPath
     * @memberof OSDPaperjsAnnotation.LinestringTool#
     */
    finishCurrentPath(){
        if(!this.drawing() || !this.item) return;
        
        let newPath = this.drawing().path;
        if(newPath.segments.length>1){
            this.item.addChild(this.drawing().path);
        }
        this.drawingGroup.removeChildren();
    }
}
export{LinestringTool};
/**
 * The LinestringToolbar class extends the AnnotationUIToolbarBase and provides the toolbar controls for the LinestringTool.
 * The constructor initializes the LinestringToolbar by calling the base class (AnnotationUIToolbarBase) constructor and sets up the necessary toolbar controls.
 * @extends AnnotationUIToolbarBase
 * @class
 * @memberof OSDPaperjsAnnotation.LinestringTool
 * @param {OSDPaperjsAnnotation.LinestringTool} linestringTool - The LinestringTool instance associated with the toolbar.
 * @property {jQuery} rangeInput - The range input element for adjusting the brush radius in the toolbar.
 * @property {jQuery} eraseButton - The erase button element in the toolbar for toggling erase mode.
 *
 */
class LinestringToolbar extends AnnotationUIToolbarBase{
    /**
     * Create a new LinestringToolbar instance.
     * The constructor initializes the LinestringToolbar by calling the base class (AnnotationUIToolbarBase) constructor and sets up the necessary toolbar controls.
     * @constructor
     * @param {OSDPaperjsAnnotation.LinestringTool} linestringTool - The LinestringTool instance associated with the toolbar.
     */
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
    /**
     * Update the brush radius based on the mouse wheel scroll direction.
     * The updateBrushRadius function is called when the user scrolls the mouse wheel in the LinestringToolbar.
     * It updates the brush radius value based on the direction of the mouse wheel scroll.
     * If the larger property of the update object is true, it increases the brush radius.
     * If the larger property of the update object is false, it decreases the brush radius.
     * @function
     * @param {Object} update - An object containing the update information.
     * @param {boolean} update.larger - A boolean value indicating whether the brush radius should be increased or decreased.
     */
    updateBrushRadius(update){
        if(update.larger){
            this.rangeInput.val(parseFloat(this.rangeInput.val())+parseFloat(this.rangeInput.attr('step'))).trigger('change');
        }
        else{
            this.rangeInput.val(parseFloat(this.rangeInput.val())-parseFloat(this.rangeInput.attr('step'))).trigger('change');
        }
    }
        /**
     * Check if the LinestringTool should be enabled for the current mode.
     * The isEnabledForMode function is called to determine if the LinestringTool should be enabled for the current mode.
     * It returns true if the mode is 'new', 'LineString', or 'MultiLineString', and false otherwise.
     * @function
     * @param {string} mode - The current mode of the tool.
     * @returns {boolean} - A boolean value indicating whether the LinestringTool should be enabled for the current mode.
     */
    isEnabledForMode(mode){
        return ['new','LineString','MultiLineString'].includes(mode);
    }
    /**
     * Set the erase mode for the LinestringTool.
     * The setEraseMode function is called when the user clicks the erase button in the LinestringToolbar.
     * It sets the erase mode of the associated LinestringTool based on the value of the erasing parameter.
     * If erasing is true, it enables the erase mode in the LinestringTool by adding the 'active' class to the erase button.
     * If erasing is false, it disables the erase mode by removing the 'active' class from the erase button.
     * @function
     * @param {boolean} erasing - A boolean value indicating whether the erase mode should be enabled or disabled.
     */
    setEraseMode(erasing){
        erasing ? this.eraseButton.addClass('active') : this.eraseButton.removeClass('active');
    }
}