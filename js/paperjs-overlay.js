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
 * * Neither the name of paperjs-overlay nor the names of its
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




import {AnnotationToolkit} from './annotationtoolkit.js';

(function (OpenSeadragon) {

    if (typeof OpenSeadragon === 'undefined') {
        console.error('[paperjs-overlay.js] requires OpenSeadragon and paper.js');
        return;
    }
    if (typeof paper==='undefined') {
        console.error('[paperjs-overlay.js] requires OpenSeadragon and paper.js');
        return;
    }

    /**
     * Adds paper.js overlay capability to your OpenSeadragon Viewer
     *
     * @param {Object} options
     *     Allows configurable properties to be entirely specified by passing
     *     an options object to the constructor.
     *
     * @param {Number} options.scale
     *     Paper 'virtual' canvas size, for creating objects
     *
     * @returns {Overlay}
     */
    OpenSeadragon.Viewer.prototype.addPaperjsOverlay = function (options) {
        this.paperjsOverlay = new Overlay(this, options);
        return this.paperjsOverlay;
    };

    /**
     * Adds AnnotationToolkit capability to your OpenSeadragon Viewer
     * Automatically creates an overlay layer to contain the paper.js-based annotations and tools
     *
     * @param {Object} viewer
     *     pass in an OpenSeadragon viewer. Defaults to `this`.
     *
     */
    OpenSeadragon.Viewer.prototype.addAnnotationToolkit = function (viewer) {
        viewer = viewer || this;
        viewer._annotationToolkit = new AnnotationToolkit(viewer);
        return viewer._annotationToolkit;
    };

    OpenSeadragon.Viewer.prototype.getImageData = function(){
        let canvas = this.drawer.canvas;
        return canvas.getContext('2d').getImageData(0,0,canvas.width, canvas.height);
        // return canvas.getContext('2d').getImageData(0,0,canvas.width*canvas.pixelRatio, canvas.height*canvas.pixelRatio);
    }

    OpenSeadragon.Viewer.prototype.getViewportRaster = function(withImageData = true){
        //TO DO: make this query subregions of the viewport directly instead of always returning the entire thing
        let view = this.paperjsOverlay && this.paperjsOverlay.paperScope.view;
        if(!view){
            console.error('Cannot call getViewportRaster before an overlay has been created');
            return;
        }
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
        console.log('Setting View rotation',degrees,center);
        let degreesToRotate = degrees - (this._rotation || 0)
        this.rotate(degreesToRotate, center);
        this._rotation = OpenSeadragon.positiveModulo(degrees, 360);
        this.emit('rotate',{rotatedBy:degreesToRotate, currentRotation:this._rotation, center:center})
    }

    paper.View.prototype.getImageData = function(){
        let canvas = this.element;
        return canvas.getContext('2d').getImageData(0,0,canvas.width, canvas.height);
        // return canvas.getContext('2d').getImageData(0,0,canvas.width*canvas.pixelRatio, canvas.height*canvas.pixelRatio);
    }


    /**
     * Static counter for multiple overlays differentiation
     * @type {function(): number}
     */
    let counter = (function () {
        let i = 1;

        return function () {
            return i++;
        }
    })();

    /**
     * Overlay object
     * @param viewer
     * @constructor
     */
    let Overlay = function (viewer) {
        let self = this;
        this.osdViewer = viewer;

        this._containerWidth = 0;
        this._containerHeight = 0;

        this._canvasdiv = document.createElement('div');
        this._canvasdiv.style.position = 'absolute';
        this._canvasdiv.style.left = "0px";
        this._canvasdiv.style.top = "0px";
        this._canvasdiv.style.width = '100%';
        this._canvasdiv.style.height = '100%';
        this.osdViewer.canvas.appendChild(this._canvasdiv);
        
        this._canvas = document.createElement('canvas');
        this._scale = this.osdViewer.world.getItemAt(this.osdViewer.currentPage()).source.width;
        if(!this._scale){
            console.error('tile source must contain width parameter')
        }
        this._id = 'osd-overlaycanvas-' + counter();
        this._canvas.setAttribute('id', this._id);
        this._canvasdiv.appendChild(this._canvas);
        this.resize();

        
        this.paperScope = new paper.PaperScope();
        this.paperScope.overlay = this;
        let ps = this.paperScope.setup(this._canvas);
        this.paperScope.project.overlay = this;
        this.ps = ps;
        this._paperProject=ps.project;
        
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

        /**
         * Update viewport
         */
        this.osdViewer.addHandler('viewport-change', onViewportChange)
        this.osdViewer.addHandler('resize',onViewerResize)    
        this.osdViewer.addHandler('rotate',onViewerRotate)
        /**
         * Clean up on viewer close
         */
        this.osdViewer.addHandler('close', onViewerClose)
        function onViewerClose(){
            console.log('paperjs-overlay close')
            self.osdViewer.removeHandler('viewport-change',onViewportChange);
            self.osdViewer.removeHandler('resize',onViewerResize);
            self.osdViewer.removeHandler('close',onViewerClose);
            self._canvasdiv.remove();
            self.ps.remove();
        }
        function onViewportChange(){
            self.resize();
            self.resizeCanvas();
        }
        function onViewerResize(){
            self.resize();
            self.resizeCanvas();
        }
        function onViewerRotate(ev){
            // console.log('Viewer rotate',ev)
            let center = self.osdViewer.viewport.viewportToImageCoordinates(self.osdViewer.viewport.getCenter());
            self.paperScope.view.setRotation(ev.degrees, center)
        }

        
    };

    /**
     * Overlay prototype
     */
    Overlay.prototype = {
        // ----------
        canvas: function () {
            return this._canvas;
        },
        // ----------
        clear: function () {
        },
        addClass: function(c){
            this._canvas.classList.add(...arguments);
            return this;
        },
        removeClass: function(c){
            this._canvas.classList.remove(...arguments);
            return this;
        },
        setAttribute: function(attr, value){
            this._canvas.setAttribute(attr,value);
            return this;
        },
        addEventListener:function(event,listener){
            this._canvas.addEventListener(event,listener);
            return this;
        },
        removeEventListener:function(event,listener){
            this._canvas.removeEventListener(event,listener);
            return this;
        },
        // ----------
        handleRescale: function(enable=false){
            let _this=this;
            this.ps.view.off('zoom-changed',_rescale);
            if(enable) this.ps.view.on('zoom-changed',_rescale );
            function _rescale(){
                _this.rescale();
            }
        },
        //-----------
        rescale: function(){
            this._paperProject.getItems({match:function(o){return o.rescale}}).forEach(function(item){
                item.applyRescale();
            });
        },
        //------------
        resize: function () {
            if (this._containerWidth !== this.osdViewer.container.clientWidth) {
                this._containerWidth = this.osdViewer.container.clientWidth;
                this._canvasdiv.setAttribute('width', this._containerWidth);
                this._canvas.setAttribute('width', this._containerWidth);
            }

            if (this._containerHeight !== this.osdViewer.container.clientHeight) {
                this._containerHeight = this.osdViewer.container.clientHeight;
                this._canvasdiv.setAttribute('height', this._containerHeight);
                this._canvas.setAttribute('height', this._containerHeight);
            }

        },
        resizeCanvas: function () {
            this.paperScope.view.viewSize = new paper.Size(this._containerWidth, this._containerHeight);
            var viewportZoom = this.osdViewer.viewport.getZoom(true);
            let oldZoom = this.paperScope.view.zoom;
            this.paperScope.view.zoom = this.osdViewer.viewport._containerInnerSize.x * viewportZoom / this._scale;
            var center = this.osdViewer.viewport.viewportToImageCoordinates(this.osdViewer.viewport.getCenter(true));
            this.osdViewer.drawer.canvas.pixelRatio = window.devicePixelRatio;
            this.paperScope.view.center = new paper.Point(center.x, center.y);
            if(Math.abs(this.paperScope.view.zoom - oldZoom)>0.0000001) this.paperScope.view.emit('zoom-changed',{zoom:this.paperScope.view.zoom});
            this.paperScope.view.update();
        }

    };

})(window.OpenSeadragon);



  