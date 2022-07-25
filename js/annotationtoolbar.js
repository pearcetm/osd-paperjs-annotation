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
            
            this.tools.forEach(t=>{
                //$(t.button.element).prop('disabled',!t.isEnabledForMode(mode))
                t.isEnabledForMode(mode) ? t.button.enable() : t.button.disable();
            })
        }

        this.setMode('initial');
    }
    addTool(toolbarControl){
        // console.log('addTool',toolbarControl)
        if(toolbarControl.tool){
            this.tools.push(toolbarControl);
            toolbarControl.button && toolbarControl.button.element && this.ui.buttongroup.buttons.push(toolbarControl.button)
            toolbarControl.dropdown && this.ui.dropdowns.append(toolbarControl.dropdown);

            // $(toolbarControl.button.element).prop('disabled',!toolbarControl.isEnabledForMode(this.currentMode))
            toolbarControl.isEnabledForMode(this.currentMode) ? toolbarControl.button.enable() : toolbarControl.button.disable();
            // console.log('Button disabled?',toolbarControl.button.element.disabled)
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
