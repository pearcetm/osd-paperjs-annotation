import {AnnotationUITool, AnnotationUIToolbarBase} from './annotationUITool.mjs';
/**
 * Represents an Ellipse Tool in the Annotation Toolkit program.
 * This tool allows users to create and modify ellipses on the canvas.
 * @class
 * @memberof OSDPaperjsAnnotation
 * @extends AnnotationUITool
 */
class EllipseTool extends AnnotationUITool{
  /**
   * Create an EllipseTool instance.
   * @param {paper.PaperScope} paperScope - The Paper.js PaperScope instance.
   * @property {paper.Tool} tool - The Paper.js tool instance for handling mouse events.
   * @property {paper.Layer} toolLayer - The Paper.js project's tool layer where the crosshairTool is added.
   * @property {string|null} mode - The current mode of the Ellipse Tool.
   *     Possible values are 'creating', 'segment-drag', 'modifying', or null.
   * @property {paper.Path.Ellipse|null} creating - The currently active ellipse being created or modified.
   * @property {EllipseToolbar} toolbarControl - The EllipseToolbar instance associated with this EllipseTool.
   */
    constructor(paperScope){
        super(paperScope);
        let self=this;

        let crosshairTool = new paper.Group({visible:false});
        let h1 = new paper.Path({segments:[new paper.Point(0,0),new paper.Point(0,0)],strokeScaling:false,strokeWidth:1,strokeColor:'black'});
        let h2 = new paper.Path({segments:[new paper.Point(0,0),new paper.Point(0,0)],strokeScaling:false,strokeWidth:1,strokeColor:'white',dashArray:[6,6]});
        let v1 = new paper.Path({segments:[new paper.Point(0,0),new paper.Point(0,0)],strokeScaling:false,strokeWidth:1,strokeColor:'black'});
        let v2 = new paper.Path({segments:[new paper.Point(0,0),new paper.Point(0,0)],strokeScaling:false,strokeWidth:1,strokeColor:'white',dashArray:[6,6]});
        crosshairTool.addChildren([h1,h2,v1,v2]);
        this.project.toolLayer.addChild(crosshairTool);
        
        this.mode = null;
        this.creating = null;
        
        this.setToolbarControl(new EllipseToolbar(this));
        
        /**
         * Event handler for mouse down events.
         * When the user clicks on the canvas, this method is called to initiate ellipse creation.
         * If the tool is in 'creating' mode, it initializes a new ellipse shape and starts tracking mouse movements.
         * If the tool is in 'segment-drag' mode, it prepares the ellipse for resizing by selecting the appropriate control point.
         * If the tool is in 'modifying' mode, it checks if the user clicked on an existing ellipse to initiate the dragging process.
         * @function onMouseDown
         * @memberof OSDPaperjsAnnotation.EllipseTool#
         * @param {paper.MouseEvent} ev - The Paper.js MouseEvent object.
         */
        this.tool.onMouseDown=function(ev){
            if(self.itemToCreate){
                self.itemToCreate.initializeGeoJSONFeature('Point', 'Ellipse');
                self.refreshItems();
                
                let r=new paper.Path.Ellipse(ev.point,ev.point);
                self.creating = r;
                self.item.removeChildren();
                self.item.addChild(r);
                self.mode='creating';
            }
            else if(self.item && self.item.hitTest(ev.point,{fill:false,stroke:false,segments:true,tolerance:5/self.project.getZoom()})){
                let result = self.item.hitTest(ev.point,{fill:false,stroke:false,segments:true,tolerance:5/self.project.getZoom()})
                if(result){
                    // crosshairTool.visible=true;
                    self.mode='segment-drag';
                    let idx=result.segment.path.segments.indexOf(result.segment);
                    let oppositeIdx=(idx+2) % result.segment.path.segments.length;
                    //save reference to the original points of the ellipse before the drag started
                    self.points = {
                        opposite: result.segment.path.segments[oppositeIdx].point.clone(),
                        drag: result.segment.point.clone(),
                        p1: result.segment.next.point.clone(),
                        p2: result.segment.previous.point.clone(),
                    }
                }
            }
            // else{
            //     self.mode='modifying';
            // }
        }
        /**
         * Event handler for mouse drag events.
         * When the user drags the mouse after initiating an ellipse creation or modification, this method is called.
         * If the tool is in 'creating' mode, it dynamically updates the temporary ellipse shape based on the drag distance.
         * If the tool is in 'segment-drag' mode, it resizes the ellipse based on the drag distance and user input.
         * @function onMouseDrag
         * @memberof OSDPaperjsAnnotation.EllipseTool#
         * @param {paper.MouseEvent} ev - The Paper.js MouseEvent object.
         */
        this.tool.onMouseDrag=function(ev){
            let currPt;
            let center = self.item.bounds.center;
            if(self.mode=='creating'){
                let angle = -self.item.view.getRotation();
                
                if(ev.modifiers.command || ev.modifiers.control){
                    let delta = ev.point.subtract(ev.downPoint);
                    let axes = [[1,1],[1,-1],[-1,-1],[-1,1]].map(p=>new paper.Point(p[0],p[1]).rotate(angle));
                    let closestAxis = axes.sort( (a, b) => a.dot(delta) - b.dot(delta))[0];
                    let proj = delta.project(closestAxis);
                    currPt = ev.downPoint.add(proj);
                } else {
                    currPt = ev.point;
                }
                let r=new paper.Rectangle(ev.downPoint.rotate(-angle,center),currPt.rotate(-angle, center));
                let ellipse = new paper.Path.Ellipse(r).rotate(angle);
                self.item.children[0].set({segments: ellipse.segments});
                ellipse.remove();
            }
            else if(self.mode=='segment-drag'){
                let dragdelta = ev.point.subtract(self.points.opposite);
                let axis = self.points.drag.subtract(self.points.opposite);
                let proj = dragdelta.project(axis);
                let angle = axis.angle;
                
                if(ev.modifiers.command || ev.modifiers.control){
                    //scale proportionally
                    let scalefactor = proj.length / axis.length;
                    let halfproj = proj.divide(2);
                    let center = self.points.opposite.add(halfproj);
                    let r1 = halfproj.length;
                    let r2 = Math.abs(self.points.p1.subtract(self.points.opposite).multiply(scalefactor).cross(proj.normalize()));
                    let ellipse = new paper.Path.Ellipse({center:center, radius: [r1, r2]}).rotate(angle);
                    self.item.children[0].set({segments: ellipse.segments});
                    ellipse.remove();
                } else {
                    //scale in one direction only
                    let halfproj = proj.divide(2);
                    let center = self.points.opposite.add(halfproj);
                    let r1 = halfproj.length;
                    let r2 = Math.abs(self.points.p1.subtract(self.points.opposite).cross(proj.normalize()));
                    let ellipse = new paper.Path.Ellipse({center:center, radius: [r1, r2]}).rotate(angle);
                    self.item.children[0].set({segments: ellipse.segments});
                    ellipse.remove();
                }

            }
            else{
                setCursorPosition(this,ev.point);
                return;
            }
            setCursorPosition(this,currPt);
            
        }
         /**
         * Event handler for mouse move events.
         * This method is called when the user moves the mouse cursor over the canvas.
         * It provides visual feedback to the user by displaying crosshair lines intersecting at the cursor position.
         * Additionally, it checks if the user is in 'modifying' mode and hovering over a control point to show a resize cursor.
         * @function onMouseMove
         * @memberof OSDPaperjsAnnotation.EllipseTool#
         * @param {paper.MouseEvent} ev - The Paper.js MouseEvent object.
         */
        this.tool.onMouseMove=function(ev){
            setCursorPosition(this,ev.point);
            if(self.mode == 'modifying'){
                let hitResult = self.item.hitTest(ev.point,{fill:false,stroke:false,segments:true,tolerance:5/self.project.getZoom()});
                if(hitResult){
                    self.project.overlay.addClass('rectangle-tool-resize');
                }
                else{
                    self.project.overlay.removeClass('rectangle-tool-resize');
                }
            }
        }
        /**
         * Event handler for mouse up events.
         * This method is called when the user releases the mouse click after creating or modifying an ellipse.
         * It finalizes the ellipse creation or modification process and updates the tool's mode accordingly.
         * @function onMouseUp
         * @memberof OSDPaperjsAnnotation.EllipseTool#
         */
        this.tool.onMouseUp = function(){
            self.mode='modifying';
            crosshairTool.visible=false;
            self.creating=null;
            self.toolbarControl.updateInstructions('Point:Ellipse');
        }
        this.extensions.onActivate = this.onSelectionChanged = function(){
            if(self.itemToCreate){
                self.mode='creating';
                crosshairTool.visible = true;
                self.creating = null;//reset reference to actively creating item
                self.toolbarControl.updateInstructions('new');
            }
            else if(self.creating && self.creating.parent==self.item){
                self.mode='creating';
                crosshairTool.visible = true;
                self.toolbarControl.updateInstructions('new');
            }
            else if (self.item){
                self.creating=null;//reset reference to actively creating item
                self.mode='modifying';
                crosshairTool.visible = false;
                self.toolbarControl.updateInstructions('Point:Ellipse');
            }
            else {
                self.creating=null;//reset reference to actively creating item
                self.mode=null;
                crosshairTool.visible = false;
                self.toolbarControl.updateInstructions('Point:Ellipse');
            }
        }
        this.extensions.onDeactivate = function(finished){
            if(finished) self.creating = null;
            crosshairTool.visible=false;
            self.mode=null;
            self.project.overlay.removeClass('rectangle-tool-resize');
        }
        /**
         * Sets the cursor position and updates the crosshairTool to provide visual feedback.
         * This function calculates the position of the crosshair lines based on the current cursor position.
         * The crosshairTool displays lines intersecting at the cursor position, providing a reference for alignment and positioning.
         * @function setCursorPosition
         * @memberof OSDPaperjsAnnotation.EllipseTool#
         * @param {paper.Tool} tool - The Paper.js Tool instance.
         * @param {paper.Point} point - The current cursor position in Paper.js coordinate system.
         */
        function setCursorPosition(tool,point){
            //to do: account for view rotation
            // let viewBounds=tool.view.bounds;
            let pt = tool.view.projectToView(point);
            let left=tool.view.viewToProject(new paper.Point(0, pt.y))
            let right=tool.view.viewToProject(new paper.Point(tool.view.viewSize.width, pt.y))
            let top=tool.view.viewToProject(new paper.Point(pt.x, 0))
            let bottom=tool.view.viewToProject(new paper.Point(pt.x,tool.view.viewSize.height))
            // console.log(viewBounds)
            h1.segments[0].point = left;
            h2.segments[0].point = left;
            h1.segments[1].point = right;
            h2.segments[1].point = right;
            v1.segments[0].point = top;
            v2.segments[0].point = top;
            v1.segments[1].point = bottom;
            v2.segments[1].point = bottom;
        }
    }
    
}
export{EllipseTool};

class EllipseToolbar extends AnnotationUIToolbarBase{
    constructor(tool){
        super(tool);
        let html = $('<i>',{class:'fa-regular fa-circle'})[0];
        this.button.configure(html,'Ellipse Tool');
        this.instructions = $('<span>').text('Click and drag to create an ellipse').appendTo(this.dropdown);
    }
    isEnabledForMode(mode){
        return ['new','Point:Ellipse'].includes(mode);
    }
    updateInstructions(mode){
        this.instructions.text(mode=='new'?'Click and drag to create an ellipse' : mode=='Point:Ellipse' ? 'Drag a point to resize' : '???' )
    }
}