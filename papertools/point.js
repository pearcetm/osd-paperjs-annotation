import {ToolBase, ToolbarBase} from './base.js';
export class PointTool extends ToolBase{
    constructor(project){
        super(project);
        let tool = this.tool;
        let self=this;
        this.setToolbarControl(new PointToolbar(this));
        tool.onMouseDown=function(ev){
            let pt =self.project.initializeItem('Point');
            pt.position=ev.point;
            if(pt){
                pt.select();
            }
            self.deactivate(true);
        }
    } 
}

class PointToolbar extends ToolbarBase{
    constructor(tool){
        super(tool);
        this.button.configure('Point','Point Tool');
        $('<span>').text('Click to create a point or drag to modify existing point').appendTo(this.dropdown);
    }
    isActiveForMode(mode){
        return ['new','Point'].includes(mode);
    }
}