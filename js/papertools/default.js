import {AnnotationUITool, AnnotationUIToolbarBase} from './annotationUITool.js';
export class DefaultTool extends AnnotationUITool{
    constructor(paperScope){
        super(paperScope);
        this.setToolbarControl(new DefaultToolbar(this));
    }
    // getToolbarControl(){}//override this so no button gets added
    onDeactivate(){}
    onActivate(){} 
}
class DefaultToolbar extends AnnotationUIToolbarBase{
    constructor(tool){
        super(tool);
        let html = $('<i>',{class:'fa-solid fa-hand'})[0];
        this.button.configure(html,'Image Navigation Tool');
        
    }
    isEnabledForMode(mode){
        return true;//enabled for all modes
        //return ['noselection','select','new','transform','Rect','Polygon','Polygon:Rectangle','Point','LineString','Polygon:Raster','Wand'].includes(mode);
    }
    
}