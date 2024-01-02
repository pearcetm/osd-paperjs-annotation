/**
 * OpenSeadragon canvas Overlay plugin based on paper.js
 * @version 0.3.0
 * 
 * Includes additional open source libraries which are subject to copyright notices
 * as indicated accompanying those segments of code.
 * 
 * Original code:
 * Copyright (c) 2022-2024, Thomas Pearce
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 * 
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 * 
 * * Neither the name of paper-overlay nor the names of its
 *   contributors may be used to endorse or promote products derived from
 *   this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * 
 */

import {AnnotationUITool, AnnotationUIToolbarBase} from './annotationUITool.mjs';
import {PaperOffset} from '../paper-offset.mjs';
/**
 * Represents a brush tool for creating and modifying annotations.
 * @class
 * @memberof OSDPaperjsAnnotation
 * @extends AnnotationUITool
 * @description The `BrushTool` constructor initialize a brush tool for creating and modifying annotations. It inherits from the `AnnotationUITool` class and includes methods to configure the tool's behavior, set the radius, set erase mode, and handle mouse events for drawing and erasing.
 */
 class BrushTool extends AnnotationUITool{
    /**
   * Create a BrushTool instance.
   * @param {paper.PaperScope} paperScope - The Paper.js PaperScope instance.
   * @property {paper.Tool} tool - The Paper.js tool instance for handling mouse events.
   * @property {boolean} eraseMode - A flag indicating whether the tool is in Erase Mode or Draw Mode.
   * @property {paper.Color} drawColor - The color for drawing strokes.
   * @property {paper.Color} eraseColor - The color for erasing strokes.
   * @property {number} radius - The current radius of the brush tool.
   * @property {paper.Shape.Circle} cursor - The Paper.js Shape.Circle representing the cursor.
   * @property {paper.Group} pathGroup - The Paper.js Group containing the drawing path and the cursor.
   * @description This constructor initializes a new brush tool instance with configurable properties, including the erase mode, draw and erase colors, brush radius, and user interaction handlers.
   */
    constructor(paperScope){
        super(paperScope);
        let self = this;
        this.setToolbarControl(new BrushToolbar(this));

        this.eraseMode = false;
        this.drawColor = new paper.Color('green');
        this.eraseColor= new paper.Color('red');
        this.drawColor.alpha=0.5;
        this.eraseColor.alpha=0.5;

        this.radius = 0;
        this.cursor = new paper.Shape.Circle(new paper.Point(0,0), this.radius);
        this.cursor.set({
            strokeWidth:1,
            strokeColor:'black',
            fillColor:this.drawColor,
            opacity:1,
            visible:false,
        });
        this.cursor.name = 'brushtool';
        this.pathGroup = new paper.Group([new paper.Path(), new paper.Path()]);
        self.project.toolLayer.addChild(this.pathGroup);
        self.project.toolLayer.addChild(this.cursor);

        this.extensions.onActivate = function(){
            self.cursor.radius = self.radius/self.project.getZoom();
            self.cursor.strokeWidth=1/self.project.getZoom();
            self.cursor.visible=true;
            self.tool.minDistance=3/self.project.getZoom();
            self.tool.maxDistance=10/self.project.getZoom();
            self.targetLayer.addChild(self.pathGroup);
        }
        this.extensions.onDeactivate = function(finished){
            self.cursor.visible=false;
            self.project.toolLayer.addChild(self.pathGroup);
            if(finished){
                self.finish();
            } 
        }

        
        
        
        
        this.tool.onMouseWheel = function(ev){
            // console.log('Wheel event',ev);
            ev.preventDefault();
            ev.stopPropagation();
            if(ev.deltaY==0) return;//ignore lateral "scrolls"
            self.toolbarControl.updateBrushRadius({larger:ev.deltaY < 0});
        }
        /**
         * Handle the key down event for the brush tool.
         * @param {paper.KeyEvent} ev - The key down event.
         * @private
         * @description This method handles the key down event for the brush tool, toggling the erase mode using the 'e' key.
         */
        this.tool.extensions.onKeyDown=function(ev){
            if(ev.key=='e'){
                if(self.eraseMode===false){
                    self.setEraseMode(true);
                }
                else {
                    self.eraseMode='keyhold';
                }
            }
        }
        /**
         * Handle the key up event for the brush tool.
         * @param {paper.KeyEvent} ev - The key up event.
         * @private
         * @description This method handles the key up event for the brush tool, releasing the erase mode when the 'e' key is released.
         */
        this.tool.extensions.onKeyUp=function(ev){
            if(ev.key=='e' && self.eraseMode=='keyhold'){
                self.setEraseMode(false);
            }
        }
    }

    onMouseDown(ev){
        ev.preventDefault(); //TODO is this necessary?
        ev.stopPropagation();
        
        if(this.itemToCreate){
            this.itemToCreate.initializeGeoJSONFeature('MultiPolygon');
            this.refreshItems();
        }
        
        this.cursor.position=ev.original.point;

        let path = new paper.Path([ev.point]);
        path.mode = this.eraseMode ? 'erase' : 'draw';
        path.radius = this.radius/this.project.getZoom();
        
        this.pathGroup.lastChild.replaceWith(path);
        this.pathGroup.lastChild.set({strokeWidth:this.cursor.radius*2,fillColor:null,strokeCap:'round'});
        if(path.mode=='erase'){
            this.pathGroup.firstChild.fillColor=this.eraseColor;
            this.pathGroup.lastChild.strokeColor=this.eraseColor;        
        }
        else{
            this.pathGroup.firstChild.fillColor=this.drawColor;
            this.pathGroup.lastChild.strokeColor=this.drawColor;
        }
    }
    onMouseUp(ev){
        this.modifyArea();
    }
    onMouseMove(ev){
        this.cursor.position=ev.original.point;
    }
    onMouseDrag(ev){
        this.cursor.position=ev.original.point;
        if(this.item){
            this.pathGroup.lastChild.add(ev.point);
            this.pathGroup.lastChild.smooth({ type: 'continuous' })
        }
    }
    /**
     * Set the radius of the brush tool.
     * @param {number} r - The new radius value for the brush.
     * @description This method sets the radius of the brush tool, affecting the size of the brush strokes.
     */
    setRadius(r){
        this.radius = r;
        this.cursor.radius=r/this.project.getZoom();
    }

    /**
         * Set the erase mode of the brush tool.
         * @param {boolean} erase - A flag indicating whether the tool should be in Erase Mode or Draw Mode.
         * @description This method toggles the erase mode of the brush tool, changing whether it adds or subtracts strokes.
         */
    setEraseMode(erase){
        this.eraseMode=erase;
        this.cursor.fillColor= erase ? this.eraseColor : this.drawColor;
        this.toolbarControl.setEraseMode(this.eraseMode);
    }  

    finish(){
        this.deactivate();
    }


  /**
   * Modify the drawn area based on the brush strokes.
   * This method is responsible for creating the final shape by modifying the drawn area with the brush strokes.
   * @private
   */ 
    modifyArea(){
        let path = this.pathGroup.lastChild;
        let shape;
        //TODO handle scaling of the offset radius by the targetLayer.matrix
        if(path.segments.length>1){                
            shape = PaperOffset.offsetStroke(path, path.radius, {join:'round',cap:'round', insert:true });
        }
        else{
            shape = new paper.Path.RegularPolygon({center: path.firstSegment.point, radius: path.radius, sides: 360 });
        }

        shape.strokeWidth = 1/this.project.getZoom();
        shape.strokeColor = 'black'
        shape.fillColor='yellow'
        shape.flatten();
        shape.name='shapeobject';
        if(!this.item.isBoundingElement){
            let boundingItems = this.item.parent.children.filter(i=>i.isBoundingElement);
            shape.applyBounds(boundingItems);
        }

        path.visible=false;
        let result;
        if(this.eraseMode){
            result = this.item.subtract(shape,{insert:false});
        }
        else{
            result = this.item.unite(shape,{insert:false});    
        }
        if(result){
            result=result.toCompoundPath();
            this.item.removeChildren();
            this.item.addChildren(result.children);
            result.remove();     
        }
        shape.remove();
    }  
}
export {BrushTool};

/**
 * Represents the Brush Tool's toolbar in the Annotation Toolkit program.
 * This toolbar provides options to set the brush radius and toggle Erase Mode.
 * @extends AnnotationUIToolbarBase
 * @memberof OSDPaperjsAnnotation.BrushTool
 */
class BrushToolbar extends AnnotationUIToolbarBase{
    /**
   * Create a BrushToolbar instance.
   * @param {BrushTool} brushTool - The parent BrushTool instance.
   */
    constructor(brushTool){
        super(brushTool);
        let html = $('<i>',{class:'fa fa-brush fa-rotate-by',style:'--fa-rotate-angle: 225deg;'})[0];
        this.button.configure(html,'Brush Tool');
        
        let fdd = $('<div>',{'data-tool':'brush',class:'dropdown brush-toolbar'}).appendTo(this.dropdown);
        let defaultRadius = 20;
        $('<label>').text('Radius').appendTo(fdd)
        this.rangeInput=$('<input>',{type:'range',min:1,max:100,value:defaultRadius}).appendTo(fdd).on('change',function(){
                // console.log('Range input changed',$(this).val());
                brushTool.setRadius($(this).val());
            });
        this.eraseButton=$('<button>',{class:'btn btn-secondary','data-action':'erase'}).appendTo(fdd).text('Erase').on('click',function(){
            let erasing = $(this).toggleClass('active').hasClass('active');
            brushTool.setEraseMode(erasing);
        });
        setTimeout(()=>brushTool.setRadius(defaultRadius), 0);
    }
  /**
   * Check if the Brush Tool is enabled for the given mode.
   * @param {string} mode - The current mode of the Annotation Toolkit program.
   * @returns {boolean} A flag indicating if the Brush Tool is enabled for the given mode.
   */
    isEnabledForMode(mode){
        return ['new','MultiPolygon'].includes(mode);
    }
  /**
   * Update the brush radius based on the provided update.
   * @param {Object} update - The update object specifying whether to make the brush radius larger or smaller.
   * @property {boolean} update.larger - A flag indicating whether to make the brush radius larger or smaller.
   */
    updateBrushRadius(update){
        if(update.larger){
            this.rangeInput.val(parseInt(this.rangeInput.val())+1).trigger('change');
        }
        else{
            this.rangeInput.val(parseInt(this.rangeInput.val())-1).trigger('change');
        }
    }
  /**
   * Set the Erase Mode on the toolbar.
   * @param {boolean} erasing - A flag indicating whether the Erase Mode is active or not.
   */
    setEraseMode(erasing){
        erasing ? this.eraseButton.addClass('active') : this.eraseButton.removeClass('active');
    }
}