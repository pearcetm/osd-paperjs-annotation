/**
 * OpenSeadragon canvas Overlay plugin based on paper.js
 * @version 0.9.0
 * 
 * Includes additional open source libraries which are subject to copyright notices
 * as indicated accompanying those segments of code.
 * 
 * Original code:
 * Copyright (c) 2022, Thomas Pearce
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

(function (OpenSeadragon) {

    if (typeof OpenSeadragon === 'undefined') {
        console.error('[paper-overlay.js] requires OpenSeadragon and paper.js');
        return;
    }
    if (typeof paper==='undefined') {
        console.error('[paper-overlay.js] requires OpenSeadragon and paper.js');
        return;
    }

    
    Object.defineProperty(OpenSeadragon.Viewer.prototype, 'PaperOverlays',{
        get: function PaperOverlays(){
            return this._PaperOverlays || (this._PaperOverlays = []);
        }
    });
    
    OpenSeadragon.Viewer.prototype.getImageData = function(){
        let canvas = this.drawer.canvas;
        return canvas.getContext('2d').getImageData(0,0,canvas.width, canvas.height);
        // return canvas.getContext('2d').getImageData(0,0,canvas.width*canvas.pixelRatio, canvas.height*canvas.pixelRatio);
    }

    OpenSeadragon.Viewer.prototype.getViewportRaster = function(view, withImageData = true){
        //TO DO: make this query subregions of the viewport directly instead of always returning the entire thing
        // let view = this.paperjsOverlay && this.paperjsOverlay.paperScope.view;
        // if(!view){
        //     console.error('Cannot call getViewportRaster before an overlay has been created');
        //     return;
        // }
        let center = view.viewToProject(new paper.Point(view.viewSize.width/2, view.viewSize.height/2 ));
        let rotation = -1 * this.viewport.getRotation();
        let rasterDef = {
            insert:false,
        }
        if(withImageData) rasterDef.canvas = this.drawer.canvas;
        else rasterDef.size = new paper.Size(this.drawer.canvas.width,this.drawer.canvas.height);
        let raster = new paper.Raster(rasterDef);

        raster.position = center;
        raster.rotate(rotation);
        let scaleFactor = view.viewSize.width / view.getZoom() / this.drawer.canvas.width;
        raster.scale(scaleFactor);
       
        return raster;
    }

    paper.View.prototype.setRotation = function(degrees, center){
        // console.log('Setting View rotation',degrees,center);
        let degreesToRotate = degrees - (this._rotation || 0)
        this.rotate(degreesToRotate, center);
        this._rotation = OpenSeadragon.positiveModulo(degrees, 360);
        this.emit('rotate',{rotatedBy:degreesToRotate, currentRotation:this._rotation, center:center})
    }

    //Add applyRescale as a method to paper objects
    paper.Item.prototype.applyRescale = function(){
        let item = this;
        let z = 1;
        let rescale = item.rescale;
        rescale && (z = item.view.getZoom()) && Object.keys(rescale).forEach(function(prop){
            item[prop] = (typeof rescale[prop] ==='function') ? rescale[prop](z) : 
                        Array.isArray(rescale[prop]) ? rescale[prop].map(function(i){return i/z}) : 
                        rescale[prop]/z;
        })
    }

})(window.OpenSeadragon);

export class PaperOverlay{

    // @param opts Object
    //  overlayType: 'image' to sync to the zoomable image, 'viewport' to stay fixed to the viewer

    constructor(viewer,opts={overlayType:'image'}){
        let defaultOpts = {
            overlayType: 'image',
        }
        opts=OpenSeadragon.extend(true,defaultOpts,opts);

        // let overlayType = opts.overlayType == 'viewport' ? 'viewport':'image'; 

        this._scale = opts.overlayType=='image' ? getViewerContentWidth(viewer) : 1;

        // if(!this._scale){
        //     console.error('tile source must contain width parameter');
        //     throw('viewer.source.width must have a (truthy numeric) value');
        // }

        this.osdViewer = viewer;
        
        viewer.PaperOverlays.push(this);
        
        let ctr = counter();
        this._id = 'paper-overlay-canvas-' + ctr;

        this._containerWidth = 0;
        this._containerHeight = 0;

        this._canvasdiv = document.createElement('div');
        this._canvasdiv.setAttribute('id','paper-overlay-'+ctr);
        this._canvasdiv.classList.add('paper-overlay');
        this._canvasdiv.style.position = 'absolute';
        this._canvasdiv.style.left = "0px";
        this._canvasdiv.style.top = "0px";
        this._canvasdiv.style.width = '100%';
        this._canvasdiv.style.height = '100%';

        this._canvas = document.createElement('canvas');
        this._canvas.setAttribute('id', this._id);
        this._canvasdiv.appendChild(this._canvas);
        
        viewer.canvas.appendChild(this._canvasdiv);
        
        
        this.paperScope = new paper.PaperScope();
        
        //monkey-patch canvas willReadFrequently attribute - will not stop the console warning on paper.js load however
        this.paperScope.CanvasProvider.getContext = function(width,height,willReadFrequently=true){
            let canvas = this.getCanvas(width,height);
            return canvas ? canvas.getContext('2d',{willReadFrequently:willReadFrequently}) : null;
        }
        
        this.paperScope.overlay = this;
        let ps = this.paperScope.setup(this._canvas);
        this.paperScope.project.overlay = this;
        this.ps = ps;
        this._paperProject=ps.project;

        this._resize();
        
        if(opts.overlayType=='image'){
            this._updatePaperView();
        } 

        
        
        this.onViewerDestroy=(self=>function(){
            self.destroy(true);
        })(this);
        this.onViewportChange=(self=>function(){
            self._updatePaperView();
        })(this);
        this.onViewerResetSize=(self=>function(ev){
            self._scale = getViewerContentWidth(ev);
            //need to setTimeout to wait for some value (viewport.getZoom()?) to actually be updated before doing our update
            //need to check for destroyed because this will get called as part of the viewer destroy chain, and we've set the timeout
            setTimeout(()=>!self.destroyed && (self._resize(), self._updatePaperView(true)));
        })(this);
        this.onViewerResize=(self=>function(){
            self._resize();
            self.paperScope.view.emit('resize',{size:new paper.Size(self._containerWidth, self._containerHeight)})
            if(opts.overlayType=='image'){
                self._updatePaperView();
            } 
        })(this);
        this.onViewerRotate=(self=>function(ev){
            // console.log('Viewer rotate',ev)
            let center = self.osdViewer.viewport.viewportToImageCoordinates(self.osdViewer.viewport.getCenter());
            self.paperScope.view.setRotation(ev.degrees, center)
        })(this);

        viewer.addHandler('resize',this.onViewerResize);
        viewer.addHandler('reset-size',this.onViewerResetSize)
        if(opts.overlayType=='image'){
            viewer.addHandler('viewport-change', this.onViewportChange)
            viewer.addHandler('rotate',this.onViewerRotate)
        }
        viewer.addOnceHandler('destroy', this.onViewerDestroy)
          
    }
    addViewerButton(params={}){
        const prefixUrl=this.osdViewer.prefixUrl;
        let button = new OpenSeadragon.Button({
            tooltip: params.tooltip,
            srcRest: prefixUrl+`button_rest.png`,
            srcGroup: prefixUrl+`button_grouphover.png`,
            srcHover: prefixUrl+`button_hover.png`,
            srcDown: prefixUrl+`button_pressed.png`,
            onClick: params.onClick,
        });
        if(params.faIconClasses){
            let i = document.createElement('i');
            i.classList.add(...params.faIconClasses.split(/\s/), 'button-icon-fa');
            button.element.appendChild(i);
            // $(button.element).append($('<i>', {class:params.faIconClasses + ' button-icon-fa'}));
        }
        this.osdViewer.buttonGroup.buttons.push(button);
        this.osdViewer.buttonGroup.element.appendChild(button.element);
        return button;
    }

    bringToFront(){
        this.osdViewer.PaperOverlays.splice(this.osdViewer.PaperOverlays.indexOf(this),1);
        this.osdViewer.PaperOverlays.push(this);
        this.osdViewer.PaperOverlays.forEach(overlay=>this.osdViewer.canvas.appendChild(overlay._canvasdiv));
        this.paperScope.activate();
    }
    sendToBack(){
        this.osdViewer.PaperOverlays.splice(this.osdViewer.PaperOverlays.indexOf(this),1);
        this.osdViewer.PaperOverlays.splice(0,0,this);
        this.osdViewer.PaperOverlays.forEach(overlay=>this.osdViewer.canvas.appendChild(overlay._canvasdiv));
        this.osdViewer.PaperOverlays[this.osdViewer.PaperOverlays.length-1].paperScope.activate();
    }
    destroy(viewerDestroyed){
        this.destroyed = true;
        this._canvasdiv.remove();
        this.paperScope.project.remove();
        this._canvasdiv.remove();
        this.ps.remove();  
        if(!viewerDestroyed){
            this.osdViewer.removeHandler('viewport-change',this.onViewportChange);
            this.osdViewer.removeHandler('resize',this.onViewerResize);
            this.osdViewer.removeHandler('close',this.onViewerDestroy);
            this.osdViewer.removeHandler('reset-size',this.onViewerResetSize);
            this.osdViewer.removeHandler('rotate',this.onViewerRotate);
            this.setOSDMouseNavEnabled(true);

            this.osdViewer.PaperOverlays.splice(this.osdViewer.PaperOverlays.indexOf(this),1);
            if(this.osdViewer.PaperOverlays.length>0){
                this.osdViewer.PaperOverlays[this.osdViewer.PaperOverlays.length-1].paperScope.activate();
            }
        }
         
    }
    clear(){
        this.paperScope.project.clear();
    }
    // ----------
    canvas() {
        return this._canvas;
    }
    // ----------
    addClass(c){
        this._canvas.classList.add(...arguments);
        return this;
    }
    removeClass(c){
        this._canvas.classList.remove(...arguments);
        return this;
    }
    setAttribute(attr, value){
        this._canvas.setAttribute(attr,value);
        return this;
    }
    addEventListener(event,listener){
        this._canvas.addEventListener(event,listener);
        return this;
    }
    removeEventListener(event,listener){
        this._canvas.removeEventListener(event,listener);
        return this;
    }
    // returns: mouseNavEnabled status BEFORE the call (for reverting)
    setOSDMouseNavEnabled(enabled=true){
        let wasMouseNavEnabled = this.osdViewer.isMouseNavEnabled();
        this.osdViewer.setMouseNavEnabled(enabled);
        return wasMouseNavEnabled;
    }
    // ----------
    autoRescaleItems(shouldHandle=false){
        let _this=this;
        this.ps.view.off('zoom-changed',_rescale);
        if(shouldHandle) this.ps.view.on('zoom-changed',_rescale );
        
        function _rescale(){
            _this.rescaleItems();
        }
    }
    //-----------
    rescaleItems(){
        this._paperProject.getItems({match:function(o){return o.rescale}}).forEach(function(item){
            item.applyRescale();
        });
    }
    //------------
    _resize() {
        let update=false;
        if (this._containerWidth !== this.osdViewer.container.clientWidth) {
            this._containerWidth = this.osdViewer.container.clientWidth;
            this._canvasdiv.setAttribute('width', this._containerWidth);
            this._canvas.setAttribute('width', this._containerWidth);
            update=true;
        }

        if (this._containerHeight !== this.osdViewer.container.clientHeight) {
            this._containerHeight = this.osdViewer.container.clientHeight;
            this._canvasdiv.setAttribute('height', this._containerHeight);
            this._canvas.setAttribute('height', this._containerHeight);
            update=true;
        }
        if(update){
            this.paperScope.view.viewSize = new paper.Size(this._containerWidth, this._containerHeight);
            this.paperScope.view.update();
        }
    }
    _updatePaperView() {
        let viewportZoom = this.osdViewer.viewport.getZoom(true);
        let oldZoom = this.paperScope.view.zoom;
        this.paperScope.view.zoom = this.osdViewer.viewport._containerInnerSize.x * viewportZoom / this._scale;
        let center = this.osdViewer.viewport.viewportToImageCoordinates(this.osdViewer.viewport.getCenter(true));
        this.osdViewer.drawer.canvas.pixelRatio = window.devicePixelRatio;
        this.paperScope.view.center = new paper.Point(center.x, center.y);
        // console.log('updatePaperView',center,this._scale)
        if(Math.abs(this.paperScope.view.zoom - oldZoom)>0.0000001){
            this.paperScope.view.emit('zoom-changed',{zoom:this.paperScope.view.zoom});
        }
        this.paperScope.view.update();
    }

    
};

let counter = (function () {
    let i = 1;

    return function () {
        return i++;
    }
})();

function getViewerContentWidth(input){
    if(input.contentSize){
        return input.contentSize.x;
    }
    let viewer = input.eventSource || input;
    let item = viewer.world.getItemAt(0);
    return item && item.getContentSize().x || 1;
    // let viewer = input.eventSource || input;
    // let item = viewer.world.getItemAt(0);
    // return (item && item.source && item.source.width) || 1;
}
  