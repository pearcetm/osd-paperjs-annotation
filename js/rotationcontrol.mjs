import { ToolBase } from './papertools/base.mjs';
import { PaperOverlay } from './paper-overlay.mjs';
import { addCSS } from './addcss.mjs';

addCSS('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.1.1/css/all.min.css', 'font-awesome/6.1.1/css/all');
addCSS(`${import.meta.url.match(/(.*?)js\/[^\/]*$/)[1]}css/osd-button.css`, 'osd-button');

/**
 * Represents an overlay for rotation control in a viewer.
 */
export class RotationControlOverlay {
  /**
   * Creates a RotationControlOverlay instance.
   * @param {object} viewer - The viewer object.
   */
  constructor(viewer) {
    /**
     * The PaperOverlay instance associated with the rotation control overlay.
     * @type {PaperOverlay}
     */
    this.overlay = new PaperOverlay(viewer, { overlayType: 'viewport' });

    /**
     * The RotationControlTool instance associated with the rotation control overlay.
     * @type {RotationControlTool}
     */
    this.tool = new RotationControlTool(this.overlay.paperScope, this);

    /**
     * A dummy tool used to capture events when the actual tool is not active.
     * @type {ToolBase}
     */
    this.dummyTool = new this.overlay.paperScope.Tool();

    this.dummyTool.activate();

    /**
     * Stores the state of mouse navigation at the time of activation.
     * @type {boolean}
     * @private
     */
    this._mouseNavEnabledAtActivation = true;

    this.overlay.addViewerButton({
      faIconClasses: 'fa-solid fa-rotate',
      tooltip: 'Rotate image',
      onClick: () => {
        tool.active ? this.deactivate() : this.activate();
      }
    });
  }

  /**
   * Activates the rotation control overlay.
   */
  activate() {
    this._mouseNavEnabledAtActivation = this.overlay.osdViewer.isMouseNavEnabled();
    this.tool.activate();
    this.tool.active = true;
    this.overlay.bringToFront();
  }

  /**
   * Deactivates the rotation control overlay.
   */
  deactivate() {
    this.tool.deactivate(true);
    this.dummyTool.activate();
    this.overlay.osdViewer.setMouseNavEnabled(this._mouseNavEnabledAtActivation);
    this.tool.active = false;
    this.overlay.sendToBack();
  }
}
/**
 * Represents a tool for controlling rotation.
 * @extends ToolBase
 */
export class RotationControlTool extends ToolBase {
    /**
     * Creates a new RotationControlTool.
     * @param {Object} paperScope - The paper scope.
     * @param {Object} rotationOverlay - The rotation overlay.
     */
    constructor(paperScope, rotationOverlay) {
        super(paperScope);
        let self = this;
        let bounds = paperScope.view.bounds;
        let widget = new RotationControlWidget(paperScope.view.bounds.center, setAngle);

        let viewer = paperScope.overlay.osdViewer;
        viewer.addHandler('rotate', (ev) => widget.setCurrentRotation(ev.degrees));
        paperScope.view.on('resize', function (ev) {
            let pos = widget.item.position;
            let w = pos.x / bounds.width;
            let h = pos.y / bounds.height;
            bounds = paperScope.view.bounds; //new bounds after the resize
            widget.item.position = new paper.Point(w * bounds.width, h * bounds.height);
        })
        widget.item.visible = false;
        self.project.toolLayer.addChild(widget.item);

        /**
         * Handles the mouse down event.
         * @param {Object} ev - The event object.
         */
        this.tool.onMouseDown = function (ev) {

        }

        /**
         * Handles the mouse drag event.
         * @param {Object} ev - The event object.
         */
        this.tool.onMouseDrag = function (ev) {

        }

        /**
         * Handles the mouse move event.
         * @param {Object} ev - The event object.
         */
        this.tool.onMouseMove = function (ev) {
            widget.setLineOrientation(ev.point);
        }

        /**
         * Handles the mouse up event.
         */
        this.tool.onMouseUp = function () {

        }

        /**
         * Handles the key down event.
         * @param {Object} ev - The event object.
         */
        this.tool.extensions.onKeyDown = function (ev) {
            if (ev.key == 'escape') {
                rotationOverlay.deactivate();
            }
        }

        /**
         * Called when the tool is activated.
         */
        this.extensions.onActivate = function () {
            if (widget.item.visible == false) {
                widget.item.position = paperScope.view.bounds.center; //reset to center when activated, so that if it gets lost off screen it's easy to recover
            }
            widget.item.visible = true;
            widget.item.opacity = 1;
        }

        /**
         * Called when the tool is deactivated.
         * @param {boolean} finished - Whether the tool finished its operation.
         */
        this.extensions.onDeactivate = function (finished) {
            if (finished) {
                widget.item.visible = false;
            }
            widget.item.opacity = 0.3;
        }

        /**
         * Sets the angle of the rotation control tool.
         * @param {number} angle - The angle to set.
         * @param {Object} [pivot] - The pivot point for the rotation. If not provided, the center of the widget is used as the pivot point.
         */
        function setAngle(angle, pivot) {
            if (!pivot) {
                let widgetCenter = new OpenSeadragon.Point(widget.item.position.x, widget.item.position.y)
                pivot = viewer.viewport.pointFromPixel(widgetCenter);
            }
            viewer.viewport.rotateTo(angle, pivot, true);
        }
    }
}

/**
 * Creates a widget for controlling the rotation of the map.
 * @function
 * @memberof AtkMap
 * @param {paper.Point} center - The center point of the widget.
 * @param {function} setAngle - The callback function to set the angle of the map.
 * @returns {Object} The widget object with properties and methods.
 */
function RotationControlWidget(center, setAngle){
    let width = center.x*2;
    let height= center.y*2;
    let radius = Math.min(width/5, height/5, 30);
    let innerRadius = radius * 0.3;

    let baseAngle = new paper.Point(0, -1).angle; //make north the reference direction for 0 degrees (even though normally it would be east)

    //group will contain all the elements of the GUI control
    let group = new paper.Group({insert:false});
    
    //circle is the central region with crosshair and cardinal points
    let circle = new paper.Path.Circle({center:new paper.Point(0,0),radius:radius});
    circle.fillColor = new paper.Color(0,0,0,0.01);//nearly transparent fill so the fill can be clickable
    circle.strokeColor = 'black';
    circle.strokeWidth = 2;
    
    //crosshair to focus on central point of circle
    [0,90,180,270].map(angle=>{
        let crosshair = new paper.Path.Line(new paper.Point(0, innerRadius),new paper.Point(0, radius));
        crosshair.rotate(angle, new paper.Point(0,0));
        crosshair.fillColor = null;
        crosshair.strokeColor = 'black';
        crosshair.strokeWidth = 2;
        group.addChild(crosshair);
    })

    //controls for north, east, south, west    
    let cardinalControls=[0,90,180,270].map(angle=>{
        let rect = new paper.Path.Rectangle(new paper.Point(-innerRadius, 0),new paper.Size(innerRadius*2,-1*(radius+innerRadius*1.5)));
        let control = rect.subtract(circle,{insert:false});
        rect.remove();
        control.rotate(angle, new paper.Point(0,0));
        control.fillColor = new paper.Color(100,100,100,0.5);
        control.strokeColor = 'black';
        control._angle = angle;
        group.addChild(control);
        return control;
        
    })

    //add circle after others so it can capture mouse events
    group.addChild(circle);

    //dot indicating current rotation status of the image
    let currentRotationIndicator = new paper.Path.Circle({center:new paper.Point(0, -radius), radius:innerRadius/1.5});
    currentRotationIndicator.set({fillColor:'yellow',strokeColor:'black',applyMatrix:false});//applyMatrix=false so the rotation property saves current value
    group.addChild(currentRotationIndicator);
    

    //line with arrows indicating that any spot on the image can be grabbed in order to perform rotation
    let rotationLineControl = new paper.Group({applyMatrix:false});
    let arrowControl = new paper.Group({applyMatrix:false});
    
    
    let rcc = new paper.Color(0.3,0.3,0.3,0.8);
    let lineControl = new paper.Path.Line(new paper.Point(0, -innerRadius), new paper.Point(0, -Math.max(width, height)));
    lineControl.strokeColor = rcc;
    lineControl.strokeWidth = 1;
    lineControl.applyMatrix=false;
    rotationLineControl.addChild(lineControl);
    rotationLineControl.addChild(arrowControl);

    let aa=94;
    let ah1 = new paper.Path.RegularPolygon(new paper.Point(-innerRadius*1.2, 0), 3, innerRadius*0.8);
    ah1.rotate(-aa);
    let ah2 = new paper.Path.RegularPolygon(new paper.Point(innerRadius*1.2, 0), 3, innerRadius*0.8);
    ah2.rotate(aa);
    let connector = new paper.Path.Arc(new paper.Point(-innerRadius*1.2, 0),new paper.Point(0, -innerRadius/4),new paper.Point(innerRadius*1.2, 0))
    let connectorbg = connector.clone();
    arrowControl.addChildren([connectorbg,connector,ah1,ah2]);
    arrowControl.fillColor = 'yellow';
    connector.strokeWidth=innerRadius/2;
    connectorbg.strokeWidth = connector.strokeWidth+2;
    connectorbg.strokeColor = rcc;
    ah1.strokeColor = rcc;
    ah2.strokeColor = rcc;
    connector.strokeColor='yellow';
    connector.fillColor=null;

    group.addChild(rotationLineControl);
    group.pivot = circle.bounds.center;//make the center of the circle the pivot for the entire  controller
    group.position = center;

    //define API
    let widget={};
    //add items
    widget.item = group;
    widget.circle = circle;
    widget.cardinalControls = cardinalControls;
    widget.rotationLineControl = rotationLineControl;

    //add API functions
    /**
     * Sets the current rotation angle of the indicator dot.
     * @method
     * @param {number} angle - The angle in degrees.
     */
    widget.setCurrentRotation = (angle)=>{
        // console.log('setCurrentRotation',angle);
        currentRotationIndicator.rotate(angle-currentRotationIndicator.rotation, circle.bounds.center)
    };
    /**
     * Sets the orientation and visibility of the line control.
     * @method
     * @param {paper.Point} point - The point to align the line control with.
     * @param {boolean} [makeVisible=false] - A flag to indicate whether to make the line control visible or not.
     */
    widget.setLineOrientation = (point, makeVisible=false)=>{
        let vector = point.subtract(circle.bounds.center);
        let angle = vector.angle - baseAngle;
        let length = vector.length;
        rotationLineControl.rotate(angle - rotationLineControl.rotation, circle.bounds.center);
        rotationLineControl.visible = makeVisible || length > radius+innerRadius*1.5;
        arrowControl.position = new paper.Point(0, -length);
    }

    //add intrinsic item-level controls
    cardinalControls.forEach(control=>{
        control.onClick = function(){
            setAngle(control._angle);
        }
    });
    currentRotationIndicator.onMouseDrag=function(ev){
        let dragAngle = ev.point.subtract(circle.bounds.center).angle;
        let angle = dragAngle - baseAngle;
        setAngle(angle);
    }
    arrowControl.onMouseDown=function(ev){
        arrowControl._angleOffset = currentRotationIndicator.rotation - ev.point.subtract(circle.bounds.center).angle;
    }
    arrowControl.onMouseDrag=function(ev){
        let hitResults = this.project.hitTestAll(ev.point).filter(hr=>cardinalControls.includes(hr.item));
        let angle;
        if(hitResults.length>0){
            //we are over a cardinal direction control object; snap the line to that angle
            // angle = -hitResults[0].item._angle + arrowControl._angleOffset;
            ev.point = hitResults[0].item.bounds.center;
        }
        angle = ev.point.subtract(circle.bounds.center).angle + arrowControl._angleOffset;
        setAngle(angle);
        widget.setLineOrientation(ev.point, true);
    }
    // arrowControl.onMouseUp = function(ev){
    //     // console.log('arrow mouseup',ev)
        
    // }
    circle.onMouseDrag=function(ev){
        widget.item.position = widget.item.position.add(ev.delta);
    }

    return widget;
}
