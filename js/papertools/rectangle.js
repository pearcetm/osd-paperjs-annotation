import { ToolBase, ToolbarBase } from './base.js';
export class RectangleTool extends ToolBase{
    constructor(project){
        super(project);
        let self=this;
        let item;

        let crosshairTool = new paper.Group();
        let h1 = new paper.Path({segments:[new paper.Point(0,0),new paper.Point(0,0)],strokeScaling:false,strokeWidth:1,strokeColor:'black'});
        let h2 = new paper.Path({segments:[new paper.Point(0,0),new paper.Point(0,0)],strokeScaling:false,strokeWidth:1,strokeColor:'white',dashArray:[10,10]});
        let v1 = new paper.Path({segments:[new paper.Point(0,0),new paper.Point(0,0)],strokeScaling:false,strokeWidth:1,strokeColor:'black'});
        let v2 = new paper.Path({segments:[new paper.Point(0,0),new paper.Point(0,0)],strokeScaling:false,strokeWidth:1,strokeColor:'white',dashArray:[10,10]});
        crosshairTool.addChildren([h1,h2,v1,v2]);
        crosshairTool.visible=false;
        this.project.paperScope.project.layers.toolLayer.addChild(crosshairTool);
        
        this.setToolbarControl(new RectToolbar(this));

        this.tool.onMouseDown=function(ev){
            if(!item){
                item = project.initializeItem('Polygon','Rectangle');
                item.select();
                let r=new paper.Path.Rectangle(ev.point,ev.point);
                item.removeChildren();
                item.addChild(r);
            }
        }
        this.tool.onMouseDrag=function(ev){
            setCursorPosition(this,ev);
            if(!item) return;
            let r=new paper.Rectangle(ev.point,ev.downPoint);
            item.children[0].set({segments:[r.topLeft, r.topRight, r.bottomRight, r.bottomLeft]})
        }
        this.tool.onMouseMove=function(ev){
            setCursorPosition(this,ev);
        }
        // this.tool.onMouseUp=function(ev){
        //     item.select && item.select();
        //     item=null;
        // }
        this.extensions.onActivate = function(){
            crosshairTool.visible = true;
            self.project.paperScope.project.activeLayer.addChild(crosshairTool);
        }
        this.extensions.onDeactivate = function(finished){
            crosshairTool.visible=false;
            self.project.paperScope.project.layers.toolLayer.addChild(crosshairTool);
            if(finished){
                item=null;
            } 
        }

        function setCursorPosition(tool,ev){
            let viewBounds=tool.view.bounds;
            // console.log(viewBounds)
            h1.segments[0].point = new paper.Point(viewBounds.x, ev.point.y)
            h2.segments[0].point = new paper.Point(viewBounds.x, ev.point.y)
            h1.segments[1].point = new paper.Point(viewBounds.x+viewBounds.width, ev.point.y)
            h2.segments[1].point = new paper.Point(viewBounds.x+viewBounds.width, ev.point.y)
            v1.segments[0].point = new paper.Point(ev.point.x, viewBounds.y)
            v2.segments[0].point = new paper.Point(ev.point.x, viewBounds.y)
            v1.segments[1].point = new paper.Point(ev.point.x, viewBounds.y+viewBounds.height)
            v2.segments[1].point = new paper.Point(ev.point.x, viewBounds.y+viewBounds.height)
        }
    }
    
}
class RectToolbar extends ToolbarBase{
    constructor(tool){
        super(tool);
        let html = $('<i>',{class:'fa-solid fa-vector-square'});
        this.button.configure(html,'Rectangle Tool');
        $('<span>').text('Click and drag to create a rectangle').appendTo(this.dropdown);
    }
    isEnabledForMode(mode){
        return ['new','Polygon:Rectangle'].includes(mode);
    }
}