export class AnnotationToolbar{

    constructor(){
        this.ui = makeUI();
        this.tools=[];
        this.currentMode = null;

        this.addToOpenSeadragon=function(viewer){
            let bg = new OpenSeadragon.ButtonGroup({buttons:this.ui.buttongroup.buttons,element:this.ui.buttongroup.element});
            viewer.addControl(bg.element,{anchor:OpenSeadragon.ControlAnchor.TOP_LEFT});
            $(this.ui.buttongroup.element).append(this.ui.dropdowns);
            $(viewer.controls.topleft).addClass('viewer-controls-topleft');
            $('.toggles .btn').attr('style','');
            //cleanup method
            this.destroy = function(){
                viewer.removeControl(this.ui.buttongroup.element);
                $(viewer.controls.topleft).removeClass('viewer-controls-topleft');
                this.ui.dropdowns.parent().remove();
            }  
        } 
        
        this.setMode = function (arg){
            let mode = arg.instructions ? 'new' : 
                arg.config ? 
                    arg.config.geometry.type +(arg.config.geometry.properties&&arg.config.geometry.properties.subtype? ':'+arg.config.geometry.properties.subtype: '') 
                    : arg;
            this.currentMode = mode;
            console.log('setToolbarMode to',mode);
            console.log('finding active tools for',mode);
            this.tools.forEach(t=>{
                $(t.button.element).prop('disabled',!t.isActiveForMode(mode))
            })
        }

        this.setMode('noselection');
    }
    addTool(toolbarControl){
        // console.log('addTool',toolbarControl)
        if(toolbarControl.tool){
            this.tools.push(toolbarControl);
            toolbarControl.button && toolbarControl.button.element && this.ui.buttongroup.buttons.push(toolbarControl.button)
            toolbarControl.dropdown && this.ui.dropdowns.append(toolbarControl.dropdown);

            // toolbarControl.tool.addEventListener('activated',(ev)=>{
            //     console.log('activated dropdown=',ev.target.toolbarControl.dropdown)
            // })
            // toolbarControl.tool.addEventListener('deactivated',(ev)=>{
            //     console.log('deactivated dropdown=',ev.target.toolbarControl.dropdown)
            // })
            $(toolbarControl.button.element).prop('disabled',!toolbarControl.isActiveForMode(this.currentMode))
        }
    }
    show(){
        $(this.ui.buttongroup.element).show();
    }
    hide(){
        $(this.ui.buttongroup.element).hide();
    }
}

function makeUI(){
    //make a container div
    let t = $('<div>',{class:'annotation-ui-drawing-toolbar btn-group btn-group-sm mode-selection'});
    let bg = {buttons:[],element:t[0]};
    let dropdowns=$('<div>',{class:'dropdowns'}).appendTo(t);
    return {
        buttongroup:bg,
        dropdowns:dropdowns,
    }
}
