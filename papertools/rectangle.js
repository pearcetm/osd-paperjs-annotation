import { ToolBase, ToolbarBase } from './base.js';
export class RectangleTool extends ToolBase{
    constructor(project){
        super(project);
        let _this=this;
        let start, end, rect;

        this.setToolbarControl(new RectToolbar(this));

        this.tool.onMouseDown=function(ev){
            rect = project.initializeItem('Polygon','Rectangle');
            start = ev.point;
            let r=new paper.Path.Rectangle(start,start);
            rect.addChild(r)
        }
        this.tool.onMouseMove=function(ev){
            if(!rect) return;
            end=ev.point;
            let r=new paper.Rectangle(start,end);
            rect.children[0].set({segments:[r.topLeft, r.topRight, r.bottomRight, r.bottomLeft]})
        }
        this.tool.onMouseUp=function(ev){
            rect.select && rect.select();
            start=end=rect=null;
            _this.broadcast('finished');
        }
    }
    
}
class RectToolbar extends ToolbarBase{
    constructor(tool){
        super(tool);
        this.button.configure('Rect','Rectangle Tool');
        $('<span>').text('Click and drag to create a rectangle').appendTo(this.dropdown);
    }
    isActiveForMode(mode){
        return ['new','Polygon:Rectangle'].includes(mode);
    }
}