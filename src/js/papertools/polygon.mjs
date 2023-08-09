import {AnnotationUITool, AnnotationUIToolbarBase} from './annotationUITool.mjs';
/**
 * Represents a polygon annotation tool that allows users to create and manipulate polygons on a canvas.
 * Inherits functionality from the AnnotationUITool class.
 * @extends AnnotationUITool
 * @class
 * @memberof OSDPaperjsAnnotation
 */
class PolygonTool extends AnnotationUITool{
    /**
     * Create a new instance of the PolygonTool class.
     * @param {paper.PaperScope} paperScope - The PaperScope instance to associate with the tool.
     */
    constructor(paperScope){
        super(paperScope);
        let self = this;
        let tool = this.tool;
        let lastClickTime = 0;

        /**
         * The drawing group where polygon paths are temporarily stored during creation.
         * @type {paper.Group}
         */
        this.drawingGroup = new paper.Group();
        self.project.toolLayer.addChild(self.drawingGroup);
        self.drawingGroup.visible=false;  
        this.draggingSegment = null;
        this.eraseMode=false;
        this.simplifying=null;
        this.simplifier = new SimplifyJS();
        this.setToolbarControl(new PolygonToolbar(this));  
        
        this.extensions.onActivate = function(){
            tool.minDistance=4/self.project.getZoom();
            tool.maxDistance=20/self.project.getZoom();
            self.drawingGroup.visible=true;
            self.drawingGroup.selected=true;
        }
        this.extensions.onDeactivate= function(finished){
            if(finished){
                self.finish();
            }
        }
        
        /**
         * Event handler for the mouse down event.
         * Handles various actions including initiating polygon drawing and erasing.
         * @param {paper.MouseEvent} ev - The mouse event object.
         */
        tool.onMouseDown=function(ev){
            self.draggingSegment=null;
            let now = Date.now();
            let interval=now-lastClickTime;
            let dblClick = interval < 300;
            lastClickTime=now;

            self.simplifying && self.cancelSimplify();  
            
            if(self.itemToCreate){
                self.itemToCreate.initializeGeoJSONFeature('MultiPolygon');
                self.refreshItems();
                
                self.saveHistory();        
            }

            let dr = self.drawing();
            if(dr && dblClick){
                self.finishCurrentPath();
                self.draggingSegment=null;
                return;
            }
            
            let hitResult = (dr&&dr.path ||self.item).hitTest(ev.point,{fill:false,stroke:true,segments:true,tolerance:(5/self.project.getZoom())})
            if(hitResult){
                //if erasing and hitResult is a segment, hitResult.segment.remove()
                if(hitResult.type=='segment' && self.eraseMode){
                    hitResult.segment.remove();
                }
                //if hitResult is a segment and NOT erasing, save reference to hitResult.segment for dragging it
                else if(hitResult.type=='segment'){
                    self.draggingSegment = hitResult.segment;
                }
                //if hitResult is a stroke, add a point:
                else if(hitResult.type=='stroke'){
                    let insertIndex = hitResult.location.index +1;
                    let ns = hitResult.item.insert(insertIndex, ev.point);
                }
            }
            else if(dr){ //already drawing, add point to the current path object
                if(ev.point.subtract(dr.path.lastSegment).length<(5/self.project.getZoom())) return;
                dr.path.add(ev.point);
            }
            else{ //not drawing yet, but start now!
                self.drawingGroup.removeChildren();
                self.drawingGroup.addChild(new paper.Path([ev.point]));
                self.drawingGroup.visible=true;
                self.drawingGroup.selected=true;
                self.drawingGroup.selectedColor= self.eraseMode ? 'red' : null;
            }
            
            
        }
        /**
         * Event handler for the mouse drag event.
         * Allows users to continue drawing or dragging polygon segments.
         * @param {paper.MouseEvent} ev - The mouse event object.
         */
        tool.onMouseDrag=function(ev){
            let dr = self.drawing();
            if(dr){
                dr.path.add(ev.point)
            }
            else if (self.draggingSegment){
                self.draggingSegment.point = self.draggingSegment.point.add(ev.delta);
            }
        }
        /**
         * Event handler for the mouse move event.
         * Provides visual feedback based on the mouse cursor's position.
         * @param {paper.MouseEvent} ev - The mouse event.
         */
        tool.onMouseMove=function(ev){
            let dr = self.drawing();
            let hitResult = self.item && (dr&&dr.path ||self.item).hitTest(ev.point,{fill:false,stroke:true,segments:true,tolerance:(5/self.project.getZoom())})
            if(hitResult){
                let action = hitResult.type + (self.eraseMode ? '-erase' : '');
                self.project.overlay.addClass('tool-action').setAttribute('data-tool-action',action);
            }
            else{
                self.project.overlay.removeClass('tool-action').setAttribute('data-tool-action','');
            }  
        }
        /**
         * Event handler for the mouse up event.
         * Finalizes polygon creation, dragging, and other interactions.
         * @param {paper.MouseEvent} ev - The mouse event.
         */
        tool.onMouseUp=function(ev){
            let dr = self.drawing();
            if(dr && dr.path.segments.length>1){
                let hitResult = dr.path.hitTest(ev.point,{fill:false,stroke:false,segments:true,tolerance:(5/self.project.getZoom())})
                if(hitResult && hitResult.segment == dr.path.firstSegment){
                    self.finishCurrentPath();
                }
            }
            else if(self.draggingSegment){
                self.draggingSegment=null;
                if(!self.item.isBoundingElement){
                    let boundingItems = self.item.parent.children.filter(i=>i.isBoundingElement);
                    self.item.applyBounds(boundingItems);
                }
            }
            self.saveHistory()
        }
        /**
         * Event handler for the key down event.
         * Handles keyboard shortcuts like toggling erase mode and undo/redo.
         * @param {paper.KeyEvent} ev - The key event.
         */
        tool.extensions.onKeyDown=function(ev){
            if(ev.key=='e'){
                if(self.eraseMode===false){
                    self.setEraseMode(true);
                }
                else if(self.eraseMode===true) {
                    self.eraseMode='keyhold';
                }
            }
            if ((ev.event.metaKey||ev.event.ctrlKey) && !ev.event.shiftKey && ev.event.key === 'z') {
                console.log('Undo!');
                self.undo();
            }
            if ((ev.event.metaKey||ev.event.ctrlKey) && ev.event.shiftKey && ev.event.key === 'z') {
                console.log('Redo!');
                self.redo();
            }
        }
        /**
         * Event handler for the key up event.
         * Handles releasing keys, such as exiting erase mode.
         * @param {paper.KeyEvent} ev - The key event.
         */
        tool.extensions.onKeyUp=function(ev){
            if(ev.key=='e' && self.eraseMode=='keyhold'){
                self.setEraseMode(false);
            }
            
        }
    
    }
    /**
     * Retrieves the current drawing state, including the active path being drawn.
     * @returns {?{path: paper.Path}} The current drawing state or null if no path is being drawn.
     */
    drawing(){
        return this.drawingGroup.lastChild && {
            path: this.drawingGroup.lastChild,
        }
    }
    /**
     * Finalizes the current polygon drawing and performs necessary cleanup.
     */
    finish(){
        this.finishCurrentPath();
        this.setEraseMode(false);
        this.draggingSegment=null;
        this.project.overlay.removeClass('tool-action').setAttribute('data-tool-action','');
        this.deactivate();
        this.drawingGroup.selected=false;      
        this.drawingGroup.visible=false;  
    }
    /**
     * Simplifies the polygon by reducing the number of points while preserving shape fidelity.
     */
    doSimplify(){
        if(!this.item) return;
        
        let lengthThreshold = 10/this.project.getZoom();
        let tol = 2.5/this.project.getZoom();
        this.simplifying = this.simplifying || this.item.clone();
        this.simplifying.item = this.item;
        this.drawingGroup.insertChild(this.simplifying,0);
        let pathsToRemove=[];
        this.simplifying.children.forEach(path=>{
            let pts = path.segments.map(s=>{
                if(s.point.subtract(s.previous.point).length < lengthThreshold && s.point.subtract(s.next.point).length < lengthThreshold){
                    s.point.x = (s.point.x+s.previous.point.x+s.next.point.x)/3;
                    s.point.y = (s.point.y+s.previous.point.y+s.next.point.y)/3;
                }
                return s.point;
            })
            pts.push(pts[0]);//
            let newpts = this.simplifier.simplify(pts,tol,true);
            path.segments=newpts;
            if(path.segments.length < 3 || Math.abs(path.area) < tol*tol) pathsToRemove.push(path);
            
        })
        pathsToRemove.forEach(p=>p.remove());
        let united = this.simplifying.unite(this.simplifying,{insert:false}).reduce().toCompoundPath();
        this.simplifying.removeChildren();
        this.simplifying.addChildren(united.children);
        if(!this.item.isBoundingElement){
            let boundingItems = this.item.parent.children.filter(i=>i.isBoundingElement);
            this.simplifying.applyBounds(boundingItems);
        }
        united.remove();
        this.simplifying.item.removeChildren();
        this.simplifying.item.addChildren(this.simplifying.children);
        this.simplifying.remove();
        this.simplifying = null;
        this.saveHistory()
        
    }
    
    /**
     * Sets the erase mode, enabling or disabling removal of segments or entire polygons.
     * @param {boolean} erase - True to enable erase mode, false to disable.
     */
    setEraseMode(erase){
        this.eraseMode=erase;
        this.item && (this.item.selectedColor = erase ? 'red' : null);
        this.drawingGroup.selectedColor= erase ? 'red' : null;
        this.toolbarControl.setEraseMode(erase);
    }
    /**
     * Completes the current polygon path and updates the annotation accordingly.
     */
    finishCurrentPath(){
        let dr = this.drawing()
        if(!dr || !this.item) return;
        dr.path.closed=true;
        // if(dr.path.parent==this.drawingGroup){
            let result = this.eraseMode ? this.item.subtract(dr.path,{insert:false}) : this.item.unite(dr.path,{insert:false});
            if(result){
                result=result.toCompoundPath();
                if(!this.item.isBoundingElement){
                    let boundingItems = this.item.parent.children.filter(i=>i.isBoundingElement);
                    result.applyBounds(boundingItems);
                }
                this.item.removeChildren();
                this.item.addChildren(result.children);
                this.item.children.forEach(child=>child.selected=false);//only have the parent set selected status
                result.remove();
            }
            this.drawingGroup.removeChildren();
        // }
    }
    /**
     * Saves the current state of the annotation to the history stack for undo/redo functionality.
     */
    saveHistory(){
        //push current state onto history stack
        const historyLength = 10;
        let idx = (this.item.history||[]).position || 0;
        this.item.history=[{
            children:this.item.children.map(x=>x.clone({insert:false,deep:true})),
            drawingGroup:this.drawingGroup.children.map(x=>x.clone({insert:false,deep:true})),
        }].concat((this.item.history||[]).slice(idx,historyLength));
    }
    /**
     * Undoes the last annotation action, restoring the previous state.
     */
    undo(){
        console.log('undoing');
        let history=(this.item.history||[]);
        let idx = (history.position || 0) +1;
        if(idx<history.length){
            this.drawingGroup.removeChildren();
            this.item.removeChildren();
            this.item.children = history[idx].children.map(x=>x.clone({insert:true,deep:true}));
            this.drawingGroup.children = history[idx].drawingGroup.map(x=>x.clone({insert:true,deep:true}));
            history.position=idx;
        }
    }
    /**
     * Redoes the previously undone annotation action, restoring the next state.
     */
    redo(){
        console.log('redoing');
        let history=(this.item.history||[]);
        let idx = (history.position || 0) -1;
        if(idx>=0){
            this.drawingGroup.removeChildren();
            this.item.removeChildren();
            this.item.children = history[idx].children.map(x=>x.clone({insert:true,deep:true}));
            this.drawingGroup.children = history[idx].drawingGroup.map(x=>x.clone({insert:true,deep:true}));
            history.position=idx;
        }
    }
}
export {PolygonTool};
/**
 * Represents the toolbar for the PolygonTool, providing UI controls for polygon annotation.
 * Inherits functionality from the AnnotationUIToolbarBase class.
 * @extends AnnotationUIToolbarBase
 * @class
 * @memberof OSDPaperjsAnnotation.PolygonTool
 */
class PolygonToolbar extends AnnotationUIToolbarBase{
    /**
     * Create a new instance of the PolygonToolbar class.
     * @param {PolygonTool} polyTool - The associated PolygonTool instance.
     */
    constructor(polyTool){
        super(polyTool);
        let self=this;
        let html = $('<i>',{class:'fa-solid fa-draw-polygon'})[0];
        this.button.configure(html,'Polygon Tool');
        
        let fdd=$('<div>',{'data-tool':'polygon',class:'dropdown polygon-toolbar'}).appendTo(this.dropdown);
        $('<span>').appendTo(fdd).text('Click or Drag');
    
        let simplifyDiv=$('<div>').appendTo(fdd);
        this.simplifyButton=$('<button>',{'data-action':'simplify'}).text('Simplify').appendTo(simplifyDiv).on('click',function(){
            polyTool.doSimplify();
        });
        this.eraseButton=$('<button>',{'data-action':'erase'}).text('Eraser').appendTo(fdd).on('click',function(){
            let erasing = $(this).toggleClass('active').hasClass('active');
            polyTool.setEraseMode(erasing);
        });
        let span = $('<span>').appendTo(fdd);
        this.undoButton=$('<button>',{title:'Undo (ctrl-Z)', 'data-action':'undo'}).text('<').appendTo(span).on('click',function(){
            polyTool.undo();
        });
        this.redoButton=$('<button>',{title:'Redo (ctrl-shift-Z)', 'data-action':'redo'}).text('>').appendTo(span).on('click',function(){
            polyTool.redo();
        });
    }
    /**
     * Check if the toolbar is enabled for the given mode.
     * @param {string} mode - The annotation mode.
     * @returns {boolean} True if enabled, false otherwise.
     */
    isEnabledForMode(mode){
        return ['new','MultiPolygon'].includes(mode);
    }
    /**
     * Set the erase mode for the toolbar, updating UI state.
     * @param {boolean} erasing - True to enable erase mode, false to disable.
     */
    setEraseMode(erasing){
        erasing ? this.eraseButton.addClass('active') : this.eraseButton.removeClass('active');
    }

}
export {PolygonToolbar};


class SimplifyJS{
    /*
    Based on:
        Simplify.js, a high-performance JS polyline simplification library
        mourner.github.io/simplify-js
        License: BSD
        Copyright (c) 2017, Vladimir Agafonkin
        All rights reserved.

        Redistribution and use in source and binary forms, with or without modification, are
        permitted provided that the following conditions are met:

        1. Redistributions of source code must retain the above copyright notice, this list of
            conditions and the following disclaimer.

        2. Redistributions in binary form must reproduce the above copyright notice, this list
            of conditions and the following disclaimer in the documentation and/or other materials
            provided with the distribution.

        THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
        EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
        MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
        COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
        EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
        SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
        HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
        TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
        SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
    */
    constructor(){

    }
    getSqDist(p1, p2) {
        // square distance between 2 points
        var dx = p1.x - p2.x,
            dy = p1.y - p2.y;
    
        return dx * dx + dy * dy;
    }
    
    getSqSegDist(p, p1, p2) {
        // square distance from a point to a segment
        var x = p1.x,
            y = p1.y,
            dx = p2.x - x,
            dy = p2.y - y;

        if (dx !== 0 || dy !== 0) {

            var t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);

            if (t > 1) {
                x = p2.x;
                y = p2.y;

            } else if (t > 0) {
                x += dx * t;
                y += dy * t;
            }
        }

        dx = p.x - x;
        dy = p.y - y;

        return dx * dx + dy * dy;
    }

    
    simplifyRadialDist(points, sqTolerance) {
        // basic distance-based simplification
        var prevPoint = points[0],
            newPoints = [prevPoint],
            point;

        for (var i = 1, len = points.length; i < len; i++) {
            point = points[i];

            if (this.getSqDist(point, prevPoint) > sqTolerance) {
                newPoints.push(point);
                prevPoint = point;
            }
        }

        if (prevPoint !== point) newPoints.push(point);

        return newPoints;
    }

    simplifyDPStep(points, first, last, sqTolerance, simplified) {
        var maxSqDist = sqTolerance,
            index;
    
        for (var i = first + 1; i < last; i++) {
            var sqDist = this.getSqSegDist(points[i], points[first], points[last]);
    
            if (sqDist > maxSqDist) {
                index = i;
                maxSqDist = sqDist;
            }
        }
    
        if (maxSqDist > sqTolerance) {
            if (index - first > 1) this.simplifyDPStep(points, first, index, sqTolerance, simplified);
            simplified.push(points[index]);
            if (last - index > 1) this.simplifyDPStep(points, index, last, sqTolerance, simplified);
        }
    }
    
    // simplification using Ramer-Douglas-Peucker algorithm
    simplifyDouglasPeucker(points, sqTolerance) {
        var last = points.length - 1;
    
        var simplified = [points[0]];
        this.simplifyDPStep(points, 0, last, sqTolerance, simplified);
        simplified.push(points[last]);
    
        return simplified;
    }
    
    // both algorithms combined for awesome performance
    simplify(points, tolerance, highestQuality) {
    
        if (points.length <= 2) return points;
    
        var sqTolerance = tolerance !== undefined ? tolerance * tolerance : 1;
    
        points = highestQuality ? points : this.simplifyRadialDist(points, sqTolerance);
        points = this.simplifyDouglasPeucker(points, sqTolerance);
    
        return points;
    }
}

