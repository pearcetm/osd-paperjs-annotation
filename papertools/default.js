import {ToolBase, ToolbarBase} from './base.js';
export class DefaultTool extends ToolBase{
    constructor(project){
        super(project);
    }
    getToolbarControl(){}//override this so no button gets added
    onDeactivate(){}
    onActivate(){} 
}
