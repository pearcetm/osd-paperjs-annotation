import { ToolBase, ToolbarBase } from './base.js';
export class RectangleTool extends ToolBase{
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
        
        this.setToolbarControl(new RectToolbar(this));

        this.tool.onMouseDown=function(ev){
            if(self.itemToCreate){
                self.project.paperScope.initializeItem('Polygon','Rectangle');
                self.getSelectedItems();
                let r=new paper.Path.Rectangle(ev.point,ev.point);
                self.creating = r;
                self.item.removeChildren();
                self.item.addChild(r);
                self.mode='creating';
            }
            else if(self.item && self.item.hitTest(ev.point,{fill:false,stroke:false,segments:true,tolerance:5/self.project.getZoom()})){
                let result = self.item.hitTest(ev.point,{fill:false,stroke:false,segments:true,tolerance:5/self.project.getZoom()})
                if(result){
                    // crosshairTool.visible=true;
                    self.mode='corner-drag';
                    let idx=result.segment.path.segments.indexOf(result.segment);
                    let oppositeIdx=(idx+2) % result.segment.path.segments.length;
                    self.refPoint = result.segment.path.segments[oppositeIdx].point;
                }
            }
            // else{
            //     self.mode='modifying';
            // }
        }
        this.tool.onMouseDrag=function(ev){
            setCursorPosition(this,ev);
            let refPt, angle;
            let center = self.item.center;
            if(self.mode=='creating'){
                angle = -self.item.view.getRotation();
                refPt = ev.downPoint;
            }
            else if(self.mode=='corner-drag'){
                // console.log('Here!',ev.item)
                angle = self.item.children[0].segments[1].point.subtract(self.item.children[0].segments[0].point).angle;
                refPt = self.refPoint;
            }
            else{
                return;
            }
            let r=new paper.Rectangle(refPt.rotate(-angle,center),ev.point.rotate(-angle, center));
            let corners = [r.topLeft, r.topRight, r.bottomRight, r.bottomLeft].map(p=>p.rotate(angle,center));
            self.item.children[0].set({segments:corners})
        }
        this.tool.onMouseMove=function(ev){
            setCursorPosition(this,ev);
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
        this.tool.onMouseUp = function(){
            self.mode='modifying';
            crosshairTool.visible=false;
            self.creating=null;
            self.toolbarControl.updateInstructions('Polygon:Rectangle');
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
                self.toolbarControl.updateInstructions('Polygon:Rectangle');
            }
            else {
                self.creating=null;//reset reference to actively creating item
                self.mode=null;
                crosshairTool.visible = false;
                self.toolbarControl.updateInstructions('Polygon:Rectangle');
            }
        }
        this.extensions.onDeactivate = function(finished){
            if(finished) self.creating = null;
            crosshairTool.visible=false;
            self.mode=null;
            self.project.overlay.removeClass('rectangle-tool-resize');
        }

        function setCursorPosition(tool,ev){
            //to do: account for view rotation
            // let viewBounds=tool.view.bounds;
            let pt = tool.view.projectToView(ev.point);
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
class RectToolbar extends ToolbarBase{
    constructor(tool){
        super(tool);
        let html = $('<i>',{class:'fa-solid fa-vector-square'});
        this.button.configure(html,'Rectangle Tool');
        this.instructions = $('<span>').text('Click and drag to create a rectangle').appendTo(this.dropdown);
    }
    isEnabledForMode(mode){
        return ['new','Polygon:Rectangle'].includes(mode);
    }
    updateInstructions(mode){
        this.instructions.text(mode=='new'?'Click and drag to create a rectangle' : mode=='Polygon:Rectangle' ? 'Drag a corner to resize' : '???' )
    }
}