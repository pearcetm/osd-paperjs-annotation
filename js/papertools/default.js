import {ToolBase, ToolbarBase} from './base.js';
export class DefaultTool extends ToolBase{
    constructor(project){
        super(project);
        this.setToolbarControl(new DefaultToolbar(this));
    }
    // getToolbarControl(){}//override this so no button gets added
    onDeactivate(){}
    onActivate(){} 
}
class DefaultToolbar extends ToolbarBase{
    constructor(tool){
        super(tool);
        let html = $('<i>',{class:'fa-solid fa-hand'});
        this.button.configure(html,'Image Navigation Tool');
        
    }
    isEnabledForMode(mode){
        return true;//enabled for all modes
        //return ['noselection','select','new','transform','Rect','Polygon','Polygon:Rectangle','Point','LineString','Polygon:Raster','Wand'].includes(mode);
    }
    
}