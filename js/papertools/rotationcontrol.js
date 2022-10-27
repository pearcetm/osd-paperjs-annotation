import { ToolBase } from './base.js';
export class RotationControlTool extends ToolBase{
    constructor(paperScope){
        super(paperScope);
        let self=this;

        let widget = new RotationControlWidget(paperScope.view.bounds, setAngle);

        let viewer = paperScope.overlay.osdViewer;
        viewer.addHandler('rotate', (ev)=>widget.setCurrentRotation(ev.degrees));

        widget.item.visible = false;
        self.project.toolLayer.addChild(widget.item);
        

        this.tool.onMouseDown=function(ev){
            
        }
        this.tool.onMouseDrag=function(ev){
            
        }
        this.tool.onMouseMove=function(ev){
            // console.log('move',ev.point)
            widget.setLineOrientation(ev.point);
        }
        this.tool.onMouseUp = function(){
            
        }
        this.extensions.onActivate = function(){
            widget.item.visible=true;
            widget.item.opacity = 1;
        }
        this.extensions.onDeactivate = function(finished){
            if(finished) widget.item.visible=false;
            widget.item.opacity = 0.3;
        }

        // function setCursorPosition(tool,ev){
            
        // }
        function setAngle(angle){
            viewer.viewport.setRotation(angle);
        }
    }
    
}

function RotationControlWidget(bounds, setAngle){

    let radius = Math.min(bounds.width/5, bounds.height/5, 50);
    let innerRadius = radius * 0.2;

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
    let lineControl = new paper.Path.Line(new paper.Point(0, -innerRadius), new paper.Point(0, -Math.max(bounds.width, bounds.height)));
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
    group.position = bounds.center;//set position after adding all children so it is applied to all

    //define API
    let widget={};
    //add items
    widget.item = group;
    widget.circle = circle;
    widget.cardinalControls = cardinalControls;
    widget.rotationLineControl = rotationLineControl;

    //add API functions
    widget.setCurrentRotation = (angle)=>{
        // console.log('setCurrentRotation',angle);
        currentRotationIndicator.rotate(angle-currentRotationIndicator.rotation, circle.bounds.center)
    };
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
        // console.log('arrow onmousedown',arrowControl._refAngle)
    }
    arrowControl.onMouseDrag=function(ev){
        let hitResults = this.project.hitTestAll(ev.point).filter(hr=>cardinalControls.includes(hr.item));
        let angle;
        if(hitResults.length>0){
            //we are over a cardinal direction control object; snap the line to that angle
            // angle = -hitResults[0].item._angle + arrowControl._angleOffset;
            ev.point = hitResults[0].item.bounds.center;
        }
        // else{
        //     angle = ev.point.subtract(circle.bounds.center).angle + arrowControl._angleOffset;
        // }
        angle = ev.point.subtract(circle.bounds.center).angle + arrowControl._angleOffset;
        
        setAngle(angle);
        widget.setLineOrientation(ev.point, true);
    }
    // arrowControl.onMouseUp = function(ev){
    //     // console.log('arrow mouseup',ev)
        
    // }

    return widget;
}