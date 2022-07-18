/**
 * OpenSeadragon canvas Overlay plugin based on svg overlay plugin and paper.js
 * @version 0.9.0
 * 
 * Includes additional open source libraries which are subject to copyright notices
 * as indicated accompanying those segments of code.
 * 
 * Original code:
 * Copyright (c) 2021, Thomas Pearce
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
 * * Neither the name of openseadragon-fabricjs-overlay nor the names of its
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


/*  Usage:
 *  Option 1:
 *  - paper.addToOpenSeadragon() - automatically creates an overlay, and adds tools for interactive drawing
 *  
 *  Option 2:
 *  - let overlay = openSeadragonViewerInstance.paperjsOverlay({scale:ts.width});
 *  - let ps = overlay._paperScope;
 */


import {AnnotationPaper} from './annotationpaper.js';
import {AnnotationUI} from './annotationui.js';

(function (OpenSeadragon) {

    if (!OpenSeadragon) {
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
    OpenSeadragon.Viewer.prototype.paperjsOverlay = function (options) {
        this._paperjsOverlayInfo = new Overlay(this, options);
        return this._paperjsOverlayInfo;
    };

    /**
     * Adds AnnotationPaper capability to your OpenSeadragon Viewer
     * Automatically creates an overlay layer to contain the paper.js-based annotations and tools
     *
     * @param {Object} viewer
     *     pass in an OpenSeadragon viewer. Defaults to `this`.
     *
     */
    OpenSeadragon.Viewer.prototype.addAnnotationPaper = function (viewer) {
        viewer = viewer || this;
        viewer._annotationPaper = new AnnotationPaper(viewer);
        return viewer._annotationPaper;
    };

    /**
     * Adds AnnotationUI capability to your OpenSeadragon Viewer
     * 
     *
     * @param {Object} viewer
     *     pass in an OpenSeadragon viewer. Defaults to `this`.
     *
     */
    OpenSeadragon.Viewer.prototype.addAnnotationUI = function (opts) {
        this._annotationUI= new AnnotationUI(this, opts);
        return this._annotationUI;
    };

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
        this._viewer = viewer;

        this._containerWidth = 0;
        this._containerHeight = 0;

        this._canvasdiv = document.createElement('div');
        this._canvasdiv.style.position = 'absolute';
        this._canvasdiv.style.left = "0px";
        this._canvasdiv.style.top = "0px";
        this._canvasdiv.style.width = '100%';
        this._canvasdiv.style.height = '100%';
        this._viewer.canvas.appendChild(this._canvasdiv);
        
        this._canvas = document.createElement('canvas');
        this._scale = this._viewer.world.getItemAt(this._viewer.currentPage()).source.width;
        if(!this._scale){
            console.error('tile source must contain width parameter')
        }
        this._id = 'osd-overlaycanvas-' + counter();
        this._canvas.setAttribute('id', this._id);
        this._canvasdiv.appendChild(this._canvas);
        this.resize();

        
        this._paperScope = new paper.PaperScope();
        let ps = this._paperScope.setup(this._canvas);
        this._paperCanvas = ps.view;
        this.ps = ps;
        this._paperProject=ps.project;
        
        

        this._viewer.disableMouseHandling = function(){
            this.setMouseNavEnabled(false);
        }
        this._viewer.enableMouseHandling = function(){
            this.setMouseNavEnabled(true);
        }

        /**
         * Update viewport
         */
        this._viewer.addHandler('viewport-change', onViewportChange)
        this._viewer.addHandler('resize',onViewerResize)    

        /**
         * Resize the paper.js overlay when the viewer or window changes size
         */
        // this._viewer.addHandler('open', function () {
        //     self.resize();
        //     self.resizeCanvas();
        // });
        // window.addEventListener('resize', function () {
        //     self.resize();
        //     self.resizeCanvas();
        // });

        /**
         * Clean up on viewer close
         */
        this._viewer.addHandler('close', onViewerClose)
        function onViewerClose(){
            console.log('paperjs-overlay close')
            self._viewer.removeHandler('viewport-change',onViewportChange);
            self._viewer.removeHandler('resize',onViewerResize);
            self._viewer.removeHandler('close',onViewerClose);
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
            //this._fabricCanvas.clear();
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
            // console.log('on zoom-changed',ev)
            let z = this._paperCanvas.getZoom();//console.log('onZoom, _this.currentZoom is now ',z)
            this._paperProject.getItems({match:function(o){return o.rescale}}).forEach(function(item){
                Object.keys(item.rescale).forEach(function(prop){
                    item[prop] = (typeof item.rescale[prop] ==='function') ? item.rescale[prop](z) : 
                                Array.isArray(item.rescale[prop]) ? item.rescale[prop].map(function(i){return i/z}) : 
                                item.rescale[prop]/z;
                })
            });
        },
        //------------
        resize: function () {
            if (this._containerWidth !== this._viewer.container.clientWidth) {
                this._containerWidth = this._viewer.container.clientWidth;
                this._canvasdiv.setAttribute('width', this._containerWidth);
                this._canvas.setAttribute('width', this._containerWidth);
            }

            if (this._containerHeight !== this._viewer.container.clientHeight) {
                this._containerHeight = this._viewer.container.clientHeight;
                this._canvasdiv.setAttribute('height', this._containerHeight);
                this._canvas.setAttribute('height', this._containerHeight);
            }

        },
        resizeCanvas: function () {
            this._paperScope.view.viewSize = new paper.Size(this._containerWidth, this._containerHeight);
            var viewportZoom = this._viewer.viewport.getZoom(true);
            let oldZoom = this._paperScope.view.zoom;
            this._paperScope.view.zoom = this._viewer.viewport._containerInnerSize.x * viewportZoom / this._scale;
            var center = this._viewer.viewport.viewportToImageCoordinates(this._viewer.viewport.getCenter(true));
            this._viewer.drawer.canvas.pixelRatio = window.devicePixelRatio;
            this._paperScope.view.center = new paper.Point(center.x, center.y);
            if(Math.abs(this._paperScope.view.zoom - oldZoom)>0.0000001) this._paperScope.view.emit('zoom-changed',{zoom:this._paperScope.view.zoom});
            this._paperScope.view.update();
        }

    };

})(window.OpenSeadragon);


(function (paper) {
    'use strict';
  
    paper = paper && Object.prototype.hasOwnProperty.call(paper, 'default') ? paper['default'] : paper;
    
    paper.MagicWand = MagicWand();

    ////// MagicWand.js
    // https://github.com/Tamersoul/magic-wand-js a3b0903 last modified Oct 13, 2020, downloaded 9/21/21 
    // The MIT License (MIT)

    // Copyright (c) 2014, Ryasnoy Paul (ryasnoypaul@gmail.com)

    // Permission is hereby granted, free of charge, to any person obtaining a copy
    // of this software and associated documentation files (the "Software"), to deal
    // in the Software without restriction, including without limitation the rights
    // to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    // copies of the Software, and to permit persons to whom the Software is
    // furnished to do so, subject to the following conditions:

    // The above copyright notice and this permission notice shall be included in all
    // copies or substantial portions of the Software.

    // THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    // IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    // FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    // AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    // LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    // OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    // SOFTWARE.


    function MagicWand() {
        var lib = {};

        /** Create a binary mask on the image by color threshold
         * Algorithm: Scanline flood fill (http://en.wikipedia.org/wiki/Flood_fill)
         * @param {Object} image: {Uint8Array} data, {int} width, {int} height, {int} bytes
         * @param {int} x of start pixel
         * @param {int} y of start pixel
         * @param {int} color threshold
         * @param {Uint8Array} mask of visited points (optional) 
         * @param {boolean} [includeBorders=false] indicate whether to include borders pixels
         * @return {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
         */
        lib.floodFill = function(image, px, py, colorThreshold, mask, includeBorders) {
            return includeBorders
                ? floodFillWithBorders(image, px, py, colorThreshold, mask)
                : floodFillWithoutBorders(image, px, py, colorThreshold, mask);
        };

        function floodFillWithoutBorders(image, px, py, colorThreshold, mask) {

            var c, x, newY, el, xr, xl, dy, dyl, dyr, checkY,
                data = image.data,
                w = image.width,
                h = image.height,
                bytes = image.bytes, // number of bytes in the color
                maxX = -1, minX = w + 1, maxY = -1, minY = h + 1,
                i = py * w + px, // start point index in the mask data
                result = new Uint8Array(w * h), // result mask
                visited = new Uint8Array(mask ? mask : w * h); // mask of visited points

            if (visited[i] === 1) return null;

            i = i * bytes; // start point index in the image data
            var sampleColor = [data[i], data[i + 1], data[i + 2], data[i + 3]]; // start point color (sample)

            var stack = [{ y: py, left: px - 1, right: px + 1, dir: 1 }]; // first scanning line
            do {
                el = stack.shift(); // get line for scanning

                checkY = false;
                for (x = el.left + 1; x < el.right; x++) {
                    dy = el.y * w;
                    i = (dy + x) * bytes; // point index in the image data

                    if (visited[dy + x] === 1) continue; // check whether the point has been visited
                    // compare the color of the sample
                    c = data[i] - sampleColor[0]; // check by red
                    if (c > colorThreshold || c < -colorThreshold) continue;
                    c = data[i + 1] - sampleColor[1]; // check by green
                    if (c > colorThreshold || c < -colorThreshold) continue;
                    c = data[i + 2] - sampleColor[2]; // check by blue
                    if (c > colorThreshold || c < -colorThreshold) continue;

                    checkY = true; // if the color of the new point(x,y) is similar to the sample color need to check minmax for Y 

                    result[dy + x] = 1; // mark a new point in mask
                    visited[dy + x] = 1; // mark a new point as visited

                    xl = x - 1;
                    // walk to left side starting with the left neighbor
                    while (xl > -1) {
                        dyl = dy + xl;
                        i = dyl * bytes; // point index in the image data
                        if (visited[dyl] === 1) break; // check whether the point has been visited
                        // compare the color of the sample
                        c = data[i] - sampleColor[0]; // check by red
                        if (c > colorThreshold || c < -colorThreshold) break;
                        c = data[i + 1] - sampleColor[1]; // check by green
                        if (c > colorThreshold || c < -colorThreshold) break;
                        c = data[i + 2] - sampleColor[2]; // check by blue
                        if (c > colorThreshold || c < -colorThreshold) break;

                        result[dyl] = 1;
                        visited[dyl] = 1;

                        xl--;
                    }
                    xr = x + 1;
                    // walk to right side starting with the right neighbor
                    while (xr < w) {
                        dyr = dy + xr;
                        i = dyr * bytes; // index point in the image data
                        if (visited[dyr] === 1) break; // check whether the point has been visited
                        // compare the color of the sample
                        c = data[i] - sampleColor[0]; // check by red
                        if (c > colorThreshold || c < -colorThreshold) break;
                        c = data[i + 1] - sampleColor[1]; // check by green
                        if (c > colorThreshold || c < -colorThreshold) break;
                        c = data[i + 2] - sampleColor[2]; // check by blue
                        if (c > colorThreshold || c < -colorThreshold) break;

                        result[dyr] = 1;
                        visited[dyr] = 1;

                        xr++;
                    }

                    // check minmax for X
                    if (xl < minX) minX = xl + 1;
                    if (xr > maxX) maxX = xr - 1;

                    newY = el.y - el.dir;
                    if (newY >= 0 && newY < h) { // add two scanning lines in the opposite direction (y - dir) if necessary
                        if (xl < el.left) stack.push({ y: newY, left: xl, right: el.left, dir: -el.dir }); // from "new left" to "current left"
                        if (el.right < xr) stack.push({ y: newY, left: el.right, right: xr, dir: -el.dir }); // from "current right" to "new right"
                    }
                    newY = el.y + el.dir;
                    if (newY >= 0 && newY < h) { // add the scanning line in the direction (y + dir) if necessary
                        if (xl < xr) stack.push({ y: newY, left: xl, right: xr, dir: el.dir }); // from "new left" to "new right"
                    }
                }
                // check minmax for Y if necessary
                if (checkY) {
                    if (el.y < minY) minY = el.y;
                    if (el.y > maxY) maxY = el.y;
                }
            } while (stack.length > 0);

            return {
                data: result,
                width: image.width,
                height: image.height,
                bounds: {
                    minX: minX,
                    minY: minY,
                    maxX: maxX,
                    maxY: maxY
                }
            };
        };

        function floodFillWithBorders(image, px, py, colorThreshold, mask) {

            var c, x, newY, el, xr, xl, dy, dyl, dyr, checkY,
                data = image.data,
                w = image.width,
                h = image.height,
                bytes = image.bytes, // number of bytes in the color
                maxX = -1, minX = w + 1, maxY = -1, minY = h + 1,
                i = py * w + px, // start point index in the mask data
                result = new Uint8Array(w * h), // result mask
                visited = new Uint8Array(mask ? mask : w * h); // mask of visited points

            if (visited[i] === 1) return null;

            i = i * bytes; // start point index in the image data
            var sampleColor = [data[i], data[i + 1], data[i + 2], data[i + 3]]; // start point color (sample)

            var stack = [{ y: py, left: px - 1, right: px + 1, dir: 1 }]; // first scanning line
            do {
                el = stack.shift(); // get line for scanning

                checkY = false;
                for (x = el.left + 1; x < el.right; x++) {
                    dy = el.y * w;
                    i = (dy + x) * bytes; // point index in the image data

                    if (visited[dy + x] === 1) continue; // check whether the point has been visited

                    checkY = true; // if the color of the new point(x,y) is similar to the sample color need to check minmax for Y 

                    result[dy + x] = 1; // mark a new point in mask
                    visited[dy + x] = 1; // mark a new point as visited

                    // compare the color of the sample
                    c = data[i] - sampleColor[0]; // check by red
                    if (c > colorThreshold || c < -colorThreshold) continue;
                    c = data[i + 1] - sampleColor[1]; // check by green
                    if (c > colorThreshold || c < -colorThreshold) continue;
                    c = data[i + 2] - sampleColor[2]; // check by blue
                    if (c > colorThreshold || c < -colorThreshold) continue;

                    xl = x - 1;
                    // walk to left side starting with the left neighbor
                    while (xl > -1) {
                        dyl = dy + xl;
                        i = dyl * bytes; // point index in the image data
                        if (visited[dyl] === 1) break; // check whether the point has been visited

                        result[dyl] = 1;
                        visited[dyl] = 1;
                        xl--;

                        // compare the color of the sample
                        c = data[i] - sampleColor[0]; // check by red
                        if (c > colorThreshold || c < -colorThreshold) break;
                        c = data[i + 1] - sampleColor[1]; // check by green
                        if (c > colorThreshold || c < -colorThreshold) break;
                        c = data[i + 2] - sampleColor[2]; // check by blue
                        if (c > colorThreshold || c < -colorThreshold) break;
                    }
                    xr = x + 1;
                    // walk to right side starting with the right neighbor
                    while (xr < w) {
                        dyr = dy + xr;
                        i = dyr * bytes; // index point in the image data
                        if (visited[dyr] === 1) break; // check whether the point has been visited

                        result[dyr] = 1;
                        visited[dyr] = 1;
                        xr++;

                        // compare the color of the sample
                        c = data[i] - sampleColor[0]; // check by red
                        if (c > colorThreshold || c < -colorThreshold) break;
                        c = data[i + 1] - sampleColor[1]; // check by green
                        if (c > colorThreshold || c < -colorThreshold) break;
                        c = data[i + 2] - sampleColor[2]; // check by blue
                        if (c > colorThreshold || c < -colorThreshold) break;
                    }

                    // check minmax for X
                    if (xl < minX) minX = xl + 1;
                    if (xr > maxX) maxX = xr - 1;

                    newY = el.y - el.dir;
                    if (newY >= 0 && newY < h) { // add two scanning lines in the opposite direction (y - dir) if necessary
                        if (xl < el.left) stack.push({ y: newY, left: xl, right: el.left, dir: -el.dir }); // from "new left" to "current left"
                        if (el.right < xr) stack.push({ y: newY, left: el.right, right: xr, dir: -el.dir }); // from "current right" to "new right"
                    }
                    newY = el.y + el.dir;
                    if (newY >= 0 && newY < h) { // add the scanning line in the direction (y + dir) if necessary
                        if (xl < xr) stack.push({ y: newY, left: xl, right: xr, dir: el.dir }); // from "new left" to "new right"
                    }
                }
                // check minmax for Y if necessary
                if (checkY) {
                    if (el.y < minY) minY = el.y;
                    if (el.y > maxY) maxY = el.y;
                }
            } while (stack.length > 0);

            return {
                data: result,
                width: image.width,
                height: image.height,
                bounds: {
                    minX: minX,
                    minY: minY,
                    maxX: maxX,
                    maxY: maxY
                }
            };
        };

        lib.thresholdMask = function(image, px, py, colorThreshold, masks={}) {

            let c, r,
                data = image.data,
                w = image.width,
                h = image.height,
                bytes = image.bytes, // number of bytes in the color
                i = py * w + px, // start point index in the mask data
                result = new Uint8Array(masks.append ? masks.append :w * h), // result mask
                ignore = new Uint8Array(masks.ignore ? masks.ignore : w * h); // mask of points to ignore

            if (ignore[i] === 1) return null;

            i = i * bytes; // start point index in the image data
            var sampleColor = [data[i], data[i + 1], data[i + 2], data[i + 3]]; // start point color (sample)
            
            for(i = 0, r = 0; i<data.length; i+=4, r+=1){
                if(ignore[r] || result[r]) continue;
                // compare the color of the sample
                c = data[i] - sampleColor[0]; // check by red
                if (c > colorThreshold || c < -colorThreshold) continue;
                c = data[i + 1] - sampleColor[1]; // check by green
                if (c > colorThreshold || c < -colorThreshold) continue;
                c = data[i + 2] - sampleColor[2]; // check by blue
                if (c > colorThreshold || c < -colorThreshold) continue;

                result[r]=1;

            }

            return {
                data: result,
                width: image.width,
                height: image.height,
                bounds: {
                    minX: 0,
                    minY: 0,
                    maxX: w,
                    maxY: h
                }
            };
        };


        /** Apply the gauss-blur filter to binary mask
         * Algorithms: http://blog.ivank.net/fastest-gaussian-blur.html
         * http://www.librow.com/articles/article-9
         * http://elynxsdk.free.fr/ext-docs/Blur/Fast_box_blur.pdf
         * @param {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
         * @param {int} blur radius
         * @return {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
         */
        lib.gaussBlur = function(mask, radius) {

            var i, k, k1, x, y, val, start, end,
                n = radius * 2 + 1, // size of the pattern for radius-neighbors (from -r to +r with the center point)
                s2 = radius * radius,
                wg = new Float32Array(n), // weights
                total = 0, // sum of weights(used for normalization)
                w = mask.width,
                h = mask.height,
                data = mask.data,
                minX = mask.bounds.minX,
                maxX = mask.bounds.maxX,
                minY = mask.bounds.minY,
                maxY = mask.bounds.maxY;

            // calc gauss weights
            for (i = 0; i < radius; i++) {
                var dsq = (radius - i) * (radius - i);
                var ww = Math.exp(-dsq / (2.0 * s2)) / (2 * Math.PI * s2);
                wg[radius + i] = wg[radius - i] = ww;
                total += 2 * ww;
            }
            // normalization weights
            for (i = 0; i < n; i++) {
                wg[i] /= total;
            }

            var result = new Uint8Array(w * h), // result mask
                endX = radius + w,
                endY = radius + h;

            //walk through all source points for blur
            for (y = minY; y < maxY + 1; y++)
                for (x = minX; x < maxX + 1; x++) {
                    val = 0;
                    k = y * w + x; // index of the point
                    start = radius - x > 0 ? radius - x : 0;
                    end = endX - x < n ? endX - x : n; // Math.min((((w - 1) - x) + radius) + 1, n);
                    k1 = k - radius;
                    // walk through x-neighbors
                    for (i = start; i < end; i++) {
                        val += data[k1 + i] * wg[i];
                    }
                    start = radius - y > 0 ? radius - y : 0;
                    end = endY - y < n ? endY - y : n; // Math.min((((h - 1) - y) + radius) + 1, n);
                    k1 = k - radius * w;
                    // walk through y-neighbors
                    for (i = start; i < end; i++) {
                        val += data[k1 + i * w] * wg[i];
                    }
                    result[k] = val > 0.5 ? 1 : 0;
                }

            return {
                data: result,
                width: w,
                height: h,
                bounds: {
                    minX: minX,
                    minY: minY,
                    maxX: maxX,
                    maxY: maxY
                }
            };
        };

        /** Create a border index array of boundary points of the mask with radius-neighbors
         * @param {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
         * @param {int} blur radius
         * @param {Uint8Array} visited: mask of visited points (optional) 
         * @return {Array} border index array of boundary points with radius-neighbors (only points need for blur)
         */
        function createBorderForBlur(mask, radius, visited) {

            var x, i, j, y, k, k1, k2,
                w = mask.width,
                h = mask.height,
                data = mask.data,
                visitedData = new Uint8Array(data),
                minX = mask.bounds.minX,
                maxX = mask.bounds.maxX,
                minY = mask.bounds.minY,
                maxY = mask.bounds.maxY,
                len = w * h,
                temp = new Uint8Array(len), // auxiliary array to check uniqueness
                border = [], // only border points
                x0 = Math.max(minX, 1),
                x1 = Math.min(maxX, w - 2),
                y0 = Math.max(minY, 1),
                y1 = Math.min(maxY, h - 2);

            if (visited && visited.length > 0) {
                // copy visited points (only "black")
                for (k = 0; k < len; k++) {
                    if (visited[k] === 1) visitedData[k] = 1;
                }
            }

            // walk through inner values except points on the boundary of the image
            for (y = y0; y < y1 + 1; y++)
                for (x = x0; x < x1 + 1; x++) {
                    k = y * w + x;
                    if (data[k] === 0) continue; // "white" point isn't the border
                    k1 = k + w; // y + 1
                    k2 = k - w; // y - 1
                    // check if any neighbor with a "white" color
                    if (visitedData[k + 1] === 0 || visitedData[k - 1] === 0 ||
                        visitedData[k1] === 0 || visitedData[k1 + 1] === 0 || visitedData[k1 - 1] === 0 ||
                        visitedData[k2] === 0 || visitedData[k2 + 1] === 0 || visitedData[k2 - 1] === 0) {
                        //if (visitedData[k + 1] + visitedData[k - 1] + 
                        //    visitedData[k1] + visitedData[k1 + 1] + visitedData[k1 - 1] +
                        //    visitedData[k2] + visitedData[k2 + 1] + visitedData[k2 - 1] == 8) continue;
                        border.push(k);
                    }
                }

            // walk through points on the boundary of the image if necessary
            // if the "black" point is adjacent to the boundary of the image, it is a border point
            if (minX == 0)
                for (y = minY; y < maxY + 1; y++)
                    if (data[y * w] === 1)
                        border.push(y * w);

            if (maxX == w - 1)
                for (y = minY; y < maxY + 1; y++)
                    if (data[y * w + maxX] === 1)
                        border.push(y * w + maxX);

            if (minY == 0)
                for (x = minX; x < maxX + 1; x++)
                    if (data[x] === 1)
                        border.push(x);

            if (maxY == h - 1)
                for (x = minX; x < maxX + 1; x++)
                    if (data[maxY * w + x] === 1)
                        border.push(maxY * w + x);

            var result = [], // border points with radius-neighbors
                start, end,
                endX = radius + w,
                endY = radius + h,
                n = radius * 2 + 1; // size of the pattern for radius-neighbors (from -r to +r with the center point)

            len = border.length;
            // walk through radius-neighbors of border points and add them to the result array
            for (j = 0; j < len; j++) {
                k = border[j]; // index of the border point
                temp[k] = 1; // mark border point
                result.push(k); // save the border point
                x = k % w; // calc x by index
                y = (k - x) / w; // calc y by index
                start = radius - x > 0 ? radius - x : 0;
                end = endX - x < n ? endX - x : n; // Math.min((((w - 1) - x) + radius) + 1, n);
                k1 = k - radius;
                // walk through x-neighbors
                for (i = start; i < end; i++) {
                    k2 = k1 + i;
                    if (temp[k2] === 0) { // check the uniqueness
                        temp[k2] = 1;
                        result.push(k2);
                    }
                }
                start = radius - y > 0 ? radius - y : 0;
                end = endY - y < n ? endY - y : n; // Math.min((((h - 1) - y) + radius) + 1, n);
                k1 = k - radius * w;
                // walk through y-neighbors
                for (i = start; i < end; i++) {
                    k2 = k1 + i * w;
                    if (temp[k2] === 0) { // check the uniqueness
                        temp[k2] = 1;
                        result.push(k2);
                    }
                }
            }

            return result;
        };

        /** Apply the gauss-blur filter ONLY to border points with radius-neighbors
         * Algorithms: http://blog.ivank.net/fastest-gaussian-blur.html
         * http://www.librow.com/articles/article-9
         * http://elynxsdk.free.fr/ext-docs/Blur/Fast_box_blur.pdf
         * @param {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
         * @param {int} blur radius
         * @param {Uint8Array} visited: mask of visited points (optional) 
         * @return {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
         */
        lib.gaussBlurOnlyBorder = function(mask, radius, visited) {

            var border = createBorderForBlur(mask, radius, visited), // get border points with radius-neighbors
                ww, dsq, i, j, k, k1, x, y, val, start, end,
                n = radius * 2 + 1, // size of the pattern for radius-neighbors (from -r to +r with center point)
                s2 = 2 * radius * radius,
                wg = new Float32Array(n), // weights
                total = 0, // sum of weights(used for normalization)
                w = mask.width,
                h = mask.height,
                data = mask.data,
                minX = mask.bounds.minX,
                maxX = mask.bounds.maxX,
                minY = mask.bounds.minY,
                maxY = mask.bounds.maxY,
                len = border.length;

            // calc gauss weights
            for (i = 0; i < radius; i++) {
                dsq = (radius - i) * (radius - i);
                ww = Math.exp(-dsq / s2) / Math.PI;
                wg[radius + i] = wg[radius - i] = ww;
                total += 2 * ww;
            }
            // normalization weights
            for (i = 0; i < n; i++) {
                wg[i] /= total;
            }

            var result = new Uint8Array(data), // copy the source mask
                endX = radius + w,
                endY = radius + h;

            //walk through all border points for blur
            for (i = 0; i < len; i++) {
                k = border[i]; // index of the border point
                val = 0;
                x = k % w; // calc x by index
                y = (k - x) / w; // calc y by index
                start = radius - x > 0 ? radius - x : 0;
                end = endX - x < n ? endX - x : n; // Math.min((((w - 1) - x) + radius) + 1, n);
                k1 = k - radius;
                // walk through x-neighbors
                for (j = start; j < end; j++) {
                    val += data[k1 + j] * wg[j];
                }
                if (val > 0.5) {
                    result[k] = 1;
                    // check minmax
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    continue;
                }
                start = radius - y > 0 ? radius - y : 0;
                end = endY - y < n ? endY - y : n; // Math.min((((h - 1) - y) + radius) + 1, n);
                k1 = k - radius * w;
                // walk through y-neighbors
                for (j = start; j < end; j++) {
                    val += data[k1 + j * w] * wg[j];
                }
                if (val > 0.5) {
                    result[k] = 1;
                    // check minmax
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                } else {
                    result[k] = 0;
                }
            }

            return {
                data: result,
                width: w,
                height: h,
                bounds: {
                    minX: minX,
                    minY: minY,
                    maxX: maxX,
                    maxY: maxY
                }
            };
        };

        /** Create a border mask (only boundary points)
         * @param {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
         * @return {Object} border mask: {Uint8Array} data, {int} width, {int} height, {Object} offset
         */
        lib.createBorderMask = function(mask) {

            var x, y, k, k1, k2,
                w = mask.width,
                h = mask.height,
                data = mask.data,
                minX = mask.bounds.minX,
                maxX = mask.bounds.maxX,
                minY = mask.bounds.minY,
                maxY = mask.bounds.maxY,
                rw = maxX - minX + 1, // bounds size
                rh = maxY - minY + 1,
                result = new Uint8Array(rw * rh), // reduced mask (bounds size)
                x0 = Math.max(minX, 1),
                x1 = Math.min(maxX, w - 2),
                y0 = Math.max(minY, 1),
                y1 = Math.min(maxY, h - 2);

            // walk through inner values except points on the boundary of the image
            for (y = y0; y < y1 + 1; y++)
                for (x = x0; x < x1 + 1; x++) {
                    k = y * w + x;
                    if (data[k] === 0) continue; // "white" point isn't the border
                    k1 = k + w; // y + 1
                    k2 = k - w; // y - 1
                    // check if any neighbor with a "white" color
                    if (data[k + 1] === 0 || data[k - 1] === 0 ||
                        data[k1] === 0 || data[k1 + 1] === 0 || data[k1 - 1] === 0 ||
                        data[k2] === 0 || data[k2 + 1] === 0 || data[k2 - 1] === 0) {
                        //if (data[k + 1] + data[k - 1] + 
                        //    data[k1] + data[k1 + 1] + data[k1 - 1] +
                        //    data[k2] + data[k2 + 1] + data[k2 - 1] == 8) continue;
                        result[(y - minY) * rw + (x - minX)] = 1;
                    }
                }

            // walk through points on the boundary of the image if necessary
            // if the "black" point is adjacent to the boundary of the image, it is a border point
            if (minX == 0)
                for (y = minY; y < maxY + 1; y++)
                    if (data[y * w] === 1)
                        result[(y - minY) * rw] = 1;

            if (maxX == w - 1)
                for (y = minY; y < maxY + 1; y++)
                    if (data[y * w + maxX] === 1)
                        result[(y - minY) * rw + (maxX - minX)] = 1;

            if (minY == 0)
                for (x = minX; x < maxX + 1; x++)
                    if (data[x] === 1)
                        result[x - minX] = 1;

            if (maxY == h - 1)
                for (x = minX; x < maxX + 1; x++)
                    if (data[maxY * w + x] === 1)
                        result[(maxY - minY) * rw + (x - minX)] = 1;

            return {
                data: result,
                width: rw,
                height: rh,
                offset: { x: minX, y: minY }
            };
        };
        
        /** Create a border index array of boundary points of the mask
         * @param {Object} mask: {Uint8Array} data, {int} width, {int} height
         * @return {Array} border index array boundary points of the mask
         */
        lib.getBorderIndices = function(mask) {

            var x, y, k, k1, k2,
                w = mask.width,
                h = mask.height,
                data = mask.data,
                border = [], // only border points
                x1 = w - 1,
                y1 = h - 1;

            // walk through inner values except points on the boundary of the image
            for (y = 1; y < y1; y++)
                for (x = 1; x < x1; x++) {
                    k = y * w + x;
                    if (data[k] === 0) continue; // "white" point isn't the border
                    k1 = k + w; // y + 1
                    k2 = k - w; // y - 1
                    // check if any neighbor with a "white" color
                    if (data[k + 1] === 0 || data[k - 1] === 0 ||
                        data[k1] === 0 || data[k1 + 1] === 0 || data[k1 - 1] === 0 ||
                        data[k2] === 0 || data[k2 + 1] === 0 || data[k2 - 1] === 0) {
                        //if (data[k + 1] + data[k - 1] + 
                        //    data[k1] + data[k1 + 1] + data[k1 - 1] +
                        //    data[k2] + data[k2 + 1] + data[k2 - 1] == 8) continue;
                        border.push(k);
                    }
                }

            // walk through points on the boundary of the image if necessary
            // if the "black" point is adjacent to the boundary of the image, it is a border point
            for (y = 0; y < h; y++)
                if (data[y * w] === 1)
                    border.push(y * w);

            for (x = 0; x < w; x++)
                if (data[x] === 1)
                    border.push(x);

            k = w - 1;
            for (y = 0; y < h; y++)
                if (data[y * w + k] === 1)
                    border.push(y * w + k);

            k = (h - 1) * w;
            for (x = 0; x < w; x++)
                if (data[k + x] === 1)
                    border.push(k + x);

            return border;
        };
        
        /** Create a compressed mask with a "white" border (1px border with zero values) for the contour tracing
         * @param {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
         * @return {Object} border mask: {Uint8Array} data, {int} width, {int} height, {Object} offset
         */
        function prepareMask(mask) {
            var x, y,
                w = mask.width,
                data = mask.data,
                minX = mask.bounds.minX,
                maxX = mask.bounds.maxX,
                minY = mask.bounds.minY,
                maxY = mask.bounds.maxY,
                rw = maxX - minX + 3, // bounds size +1 px on each side (a "white" border)
                rh = maxY - minY + 3,
                result = new Uint8Array(rw * rh); // reduced mask (bounds size)

            // walk through inner values and copy only "black" points to the result mask
            for (y = minY; y < maxY + 1; y++)
                for (x = minX; x < maxX + 1; x++) {
                    if (data[y * w + x] === 1)
                        result[(y - minY + 1) * rw + (x - minX + 1)] = 1;
                }

            return {
                data: result,
                width: rw,
                height: rh,
                offset: { x: minX - 1, y: minY - 1 }
            };
        };
            
        /** Create a contour array for the binary mask
         * Algorithm: http://www.sciencedirect.com/science/article/pii/S1077314203001401
         * @param {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
         * @return {Array} contours: {Array} points, {bool} inner, {int} label
         */
        lib.traceContours = function(mask) {
            var m = prepareMask(mask),
                contours = [],
                label = 0,
                w = m.width,
                w2 = w * 2,
                h = m.height,
                src = m.data,
                dx = m.offset.x,
                dy = m.offset.y,
                dest = new Uint8Array(src), // label matrix
                i, j, x, y, k, k1, c, inner, dir, first, second, current, previous, next, d;

            // all [dx,dy] pairs (array index is the direction)
            // 5 6 7
            // 4 X 0
            // 3 2 1
            var directions = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

            for (y = 1; y < h - 1; y++)
                for (x = 1; x < w - 1; x++) {
                    k = y * w + x;
                    if (src[k] === 1) {
                        for (i = -w; i < w2; i += w2) { // k - w: outer tracing (y - 1), k + w: inner tracing (y + 1)
                            if (src[k + i] === 0 && dest[k + i] === 0) { // need contour tracing
                                inner = i === w; // is inner contour tracing ?
                                label++; // label for the next contour

                                c = [];
                                dir = inner ? 2 : 6; // start direction
                                current = previous = first = { x: x, y: y };
                                second = null;
                                while (true) {
                                    dest[current.y * w + current.x] = label; // mark label for the current point 
                                    // bypass all the neighbors around the current point in a clockwise
                                    for (j = 0; j < 8; j++) {
                                        dir = (dir + 1) % 8;

                                        // get the next point by new direction
                                        d = directions[dir]; // index as direction
                                        next = { x: current.x + d[0], y: current.y + d[1] };

                                        k1 = next.y * w + next.x;
                                        if (src[k1] === 1) // black boundary pixel
                                        {
                                            dest[k1] = label; // mark a label
                                            break;
                                        }
                                        dest[k1] = -1; // mark a white boundary pixel
                                        next = null;
                                    }
                                    if (next === null) break; // no neighbours (one-point contour)
                                    current = next;
                                    if (second) {
                                        if (previous.x === first.x && previous.y === first.y && current.x === second.x && current.y === second.y) {
                                            break; // creating the contour completed when returned to original position
                                        }
                                    } else {
                                        second = next;
                                    }
                                    c.push({ x: previous.x + dx, y: previous.y + dy });
                                    previous = current;
                                    dir = (dir + 4) % 8; // next dir (symmetrically to the current direction)
                                }

                                if (next != null) {
                                    c.push({ x: first.x + dx, y: first.y + dy }); // close the contour
                                    contours.push({ inner: inner, label: label, points: c }); // add contour to the list
                                }
                            }
                        }
                    }
                }

            return contours;
        };
        
        /** Simplify contours
         * Algorithms: http://psimpl.sourceforge.net/douglas-peucker.html 
         * http://neerc.ifmo.ru/wiki/index.php?title=%D0%A3%D0%BF%D1%80%D0%BE%D1%89%D0%B5%D0%BD%D0%B8%D0%B5_%D0%BF%D0%BE%D0%BB%D0%B8%D0%B3%D0%BE%D0%BD%D0%B0%D0%BB%D1%8C%D0%BD%D0%BE%D0%B9_%D1%86%D0%B5%D0%BF%D0%B8
         * @param {Array} contours: {Array} points, {bool} inner, {int} label
         * @param {float} simplify tolerant
         * @param {int} simplify count: min number of points when the contour is simplified
         * @return {Array} contours: {Array} points, {bool} inner, {int} label, {int} initialCount
         */
        lib.simplifyContours = function(contours, simplifyTolerant, simplifyCount) {
            var lenContours = contours.length,
                result = [],
                i, j, k, c, points, len, resPoints, lst, stack, ids,
                maxd, maxi, dist, r1, r2, r12, dx, dy, pi, pf, pl;

            // walk through all contours 
            for (j = 0; j < lenContours; j++) {
                c = contours[j];
                points = c.points;
                len = c.points.length;

                if (len < simplifyCount) { // contour isn't simplified
                    resPoints = [];
                    for (k = 0; k < len; k++) {
                        resPoints.push({ x: points[k].x, y: points[k].y });
                    }
                    result.push({ inner: c.inner, label: c.label, points: resPoints, initialCount: len });
                    continue;
                }

                lst = [0, len - 1]; // always add first and last points
                stack = [{ first: 0, last: len - 1 }]; // first processed edge

                do {
                    ids = stack.shift();
                    if (ids.last <= ids.first + 1) // no intermediate points
                    {
                        continue;
                    }

                    maxd = -1.0; // max distance from point to current edge
                    maxi = ids.first; // index of maximally distant point

                    for (i = ids.first + 1; i < ids.last; i++) // bypass intermediate points in edge
                    {
                        // calc the distance from current point to edge
                        pi = points[i];
                        pf = points[ids.first];
                        pl = points[ids.last];
                        dx = pi.x - pf.x;
                        dy = pi.y - pf.y;
                        r1 = Math.sqrt(dx * dx + dy * dy);
                        dx = pi.x - pl.x;
                        dy = pi.y - pl.y;
                        r2 = Math.sqrt(dx * dx + dy * dy);
                        dx = pf.x - pl.x;
                        dy = pf.y - pl.y;
                        r12 = Math.sqrt(dx * dx + dy * dy);
                        if (r1 >= Math.sqrt(r2 * r2 + r12 * r12)) dist = r2;
                        else if (r2 >= Math.sqrt(r1 * r1 + r12 * r12)) dist = r1;
                        else dist = Math.abs((dy * pi.x - dx * pi.y + pf.x * pl.y - pl.x * pf.y) / r12);

                        if (dist > maxd) {
                            maxi = i; // save the index of maximally distant point
                            maxd = dist;
                        }
                    }

                    if (maxd > simplifyTolerant) // if the max "deviation" is larger than allowed then...
                    {
                        lst.push(maxi); // add index to the simplified list
                        stack.push({ first: ids.first, last: maxi }); // add the left part for processing
                        stack.push({ first: maxi, last: ids.last }); // add the right part for processing
                    }

                } while (stack.length > 0);

                resPoints = [];
                len = lst.length;
                lst.sort(function(a, b) { return a - b; }); // restore index order
                for (k = 0; k < len; k++) {
                    resPoints.push({ x: points[lst[k]].x, y: points[lst[k]].y }); // add result points to the correct order
                }
                result.push({ inner: c.inner, label: c.label, points: resPoints, initialCount: c.points.length });
            }

            return result;
        };
        

        return lib;
    };

    // if (typeof module !== "undefined" && module !== null) module.exports = MagicWand;
    // if (typeof window !== "undefined" && window !== null) window.MagicWand = MagicWand;
}(paper));


////// Offset.js
/* Downloaded from https://github.com/glenzli/paperjs-offset/ on 10/9/2021 */
/*
MIT License

Copyright (c) 2016-2019 luz-alphacode

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
(function (paper) {
    'use strict';
  
    paper = paper && Object.prototype.hasOwnProperty.call(paper, 'default') ? paper['default'] : paper;
  
    /**
     * Offset the start/terminal segment of a bezier curve
     * @param segment segment to offset
     * @param curve curve to offset
     * @param handleNormal the normal of the the line formed of two handles
     * @param offset offset value
     */
    function offsetSegment(segment, curve, handleNormal, offset) {
        var isFirst = segment.curve === curve;
        // get offset vector
        var offsetVector = (curve.getNormalAtTime(isFirst ? 0 : 1)).multiply(offset);
        // get offset point
        var point = segment.point.add(offsetVector);
        var newSegment = new paper.Segment(point);
        // handleOut for start segment & handleIn for terminal segment
        var handle = (isFirst ? 'handleOut' : 'handleIn');
        newSegment[handle] = segment[handle].add(handleNormal.subtract(offsetVector).divide(2));
        return newSegment;
    }
    /**
     * Adaptive offset a curve by repeatly apply the approximation proposed by Tiller and Hanson.
     * @param curve curve to offset
     * @param offset offset value
     */
    function adaptiveOffsetCurve(curve, offset) {
        var hNormal = (new paper.Curve(curve.segment1.handleOut.add(curve.segment1.point), new paper.Point(0, 0), new paper.Point(0, 0), curve.segment2.handleIn.add(curve.segment2.point))).getNormalAtTime(0.5).multiply(offset);
        var segment1 = offsetSegment(curve.segment1, curve, hNormal, offset);
        var segment2 = offsetSegment(curve.segment2, curve, hNormal, offset);
        // divide && re-offset
        var offsetCurve = new paper.Curve(segment1, segment2);
        // if the offset curve is not self intersected, divide it
        if (offsetCurve.getIntersections(offsetCurve).length === 0) {
            var threshold = Math.min(Math.abs(offset) / 10, 1);
            var midOffset = offsetCurve.getPointAtTime(0.5).getDistance(curve.getPointAtTime(0.5));
            if (Math.abs(midOffset - Math.abs(offset)) > threshold) {
                var subCurve = curve.divideAtTime(0.5);
                if (subCurve != null) {
                    return adaptiveOffsetCurve(curve, offset).concat(adaptiveOffsetCurve(subCurve, offset));
                }
            }
        }
        return [segment1, segment2];
    }
    /**
     * Create a round join segment between two adjacent segments.
     */
    function makeRoundJoin(segment1, segment2, originPoint, radius) {
        var through = segment1.point.subtract(originPoint).add(segment2.point.subtract(originPoint))
            .normalize(Math.abs(radius)).add(originPoint);
        var arc = new paper.Path.Arc({ from: segment1.point, to: segment2.point, through: through, insert: false });
        segment1.handleOut = arc.firstSegment.handleOut;
        segment2.handleIn = arc.lastSegment.handleIn;
        return arc.segments.length === 3 ? arc.segments[1] : null;
    }
    function det(p1, p2) {
        return p1.x * p2.y - p1.y * p2.x;
    }
    /**
     * Get the intersection point of point based lines
     */
    function getPointLineIntersections(p1, p2, p3, p4) {
        var l1 = p1.subtract(p2);
        var l2 = p3.subtract(p4);
        var dl1 = det(p1, p2);
        var dl2 = det(p3, p4);
        return new paper.Point(dl1 * l2.x - l1.x * dl2, dl1 * l2.y - l1.y * dl2).divide(det(l1, l2));
    }
    /**
     * Connect two adjacent bezier curve, each curve is represented by two segments,
     * create different types of joins or simply removal redundant segment.
     */
    function connectAdjacentBezier(segments1, segments2, origin, joinType, offset, limit) {
        var curve1 = new paper.Curve(segments1[0], segments1[1]);
        var curve2 = new paper.Curve(segments2[0], segments2[1]);
        var intersection = curve1.getIntersections(curve2);
        var distance = segments1[1].point.getDistance(segments2[0].point);
        if (origin.isSmooth()) {
            segments2[0].handleOut = segments2[0].handleOut.project(origin.handleOut);
            segments2[0].handleIn = segments1[1].handleIn.project(origin.handleIn);
            segments2[0].point = segments1[1].point.add(segments2[0].point).divide(2);
            segments1.pop();
        }
        else {
            if (intersection.length === 0) {
                if (distance > Math.abs(offset) * 0.1) {
                    // connect
                    switch (joinType) {
                        case 'miter':
                            var join = getPointLineIntersections(curve1.point2, curve1.point2.add(curve1.getTangentAtTime(1)), curve2.point1, curve2.point1.add(curve2.getTangentAtTime(0)));
                            // prevent sharp angle
                            var joinOffset = Math.max(join.getDistance(curve1.point2), join.getDistance(curve2.point1));
                            if (joinOffset < Math.abs(offset) * limit) {
                                segments1.push(new paper.Segment(join));
                            }
                            break;
                        case 'round':
                            var mid = makeRoundJoin(segments1[1], segments2[0], origin.point, offset);
                            if (mid) {
                                segments1.push(mid);
                            }
                            break;
                    }
                }
                else {
                    segments2[0].handleIn = segments1[1].handleIn;
                    segments1.pop();
                }
            }
            else {
                var second1 = curve1.divideAt(intersection[0]);
                if (second1) {
                    var join = second1.segment1;
                    var second2 = curve2.divideAt(curve2.getIntersections(curve1)[0]);
                    join.handleOut = second2 ? second2.segment1.handleOut : segments2[0].handleOut;
                    segments1.pop();
                    segments2[0] = join;
                }
                else {
                    segments2[0].handleIn = segments1[1].handleIn;
                    segments1.pop();
                }
            }
        }
    }
    /**
     * Connect all the segments together.
     */
    function connectBeziers(rawSegments, join, source, offset, limit) {
        var originSegments = source.segments;
        if(rawSegments.length==0) return source.segments;
        var first = rawSegments[0].slice();
        for (var i = 0; i < rawSegments.length - 1; ++i) {
            connectAdjacentBezier(rawSegments[i], rawSegments[i + 1], originSegments[i + 1], join, offset, limit);
        }
        if (source.closed) {
            connectAdjacentBezier(rawSegments[rawSegments.length - 1], first, originSegments[0], join, offset, limit);
            rawSegments[0][0] = first[0];
        }
        return rawSegments;
    }
    function reduceSingleChildCompoundPath(path) {
        if (path.children.length === 1) {
            path = path.children[0];
            path.remove(); // remove from parent, this is critical, or the style attributes will be ignored
        }
        return path;
    }
    /** Normalize a path, always clockwise, non-self-intersection, ignore really small components, and no one-component compound path. */
    function normalize(path, areaThreshold) {
        if (areaThreshold === void 0) { areaThreshold = 0.01; }
        if (path.closed) {
            var ignoreArea_1 = Math.abs(path.area * areaThreshold);
            if (!path.clockwise) {
                path.reverse();
            }
            path = path.unite(path, { insert: false });
            if (path instanceof paper.CompoundPath) {
                path.children.filter(function (c) { return Math.abs(c.area) < ignoreArea_1; }).forEach(function (c) { return c.remove(); });
                if (path.children.length === 1) {
                    return reduceSingleChildCompoundPath(path);
                }
            }
        }
        return path;
    }
    function isSameDirection(partialPath, fullPath) {
        var offset1 = partialPath.segments[0].location.offset;
        var offset2 = partialPath.segments[Math.max(1, Math.floor(partialPath.segments.length / 2))].location.offset;
        var sampleOffset = (offset1 + offset2) / 3;
        var originOffset1 = fullPath.getNearestLocation(partialPath.getPointAt(sampleOffset)).offset;
        var originOffset2 = fullPath.getNearestLocation(partialPath.getPointAt(2 * sampleOffset)).offset;
        return originOffset1 < originOffset2;
    }
    /** Remove self intersection when offset is negative by point direction dectection. */
    function removeIntersection(path) {
        if (path.closed) {
            var newPath = path.unite(path, { insert: false });
            if (newPath instanceof paper.CompoundPath) {
                newPath.children.filter(function (c) {
                    if (c.segments.length > 1) {
                        return !isSameDirection(c, path);
                    }
                    else {
                        return true;
                    }
                }).forEach(function (c) { return c.remove(); });
                return reduceSingleChildCompoundPath(newPath);
            }
        }
        return path;
    }
    function getSegments(path) {
        if (path instanceof paper.CompoundPath) {
            return path.children.map(function (c) { return c.segments; }).flat();
        }
        else {
            return path.segments;
        }
    }
    /**
     * Remove impossible segments in negative offset condition.
     */
    function removeOutsiders(newPath, path) {
        var segments = getSegments(newPath).slice();
        segments.forEach(function (segment) {
            if (!path.contains(segment.point)) {
                segment.remove();
            }
        });
    }
    function preparePath(path, offset) {
        var source = path.clone({ insert: false });
        source.reduce({});
        if (!path.clockwise) {
            source.reverse();
            offset = -offset;
        }
        return [source, offset];
    }
    function offsetSimpleShape(path, offset, join, limit) {
        var _a;
        var source;
        _a = preparePath(path, offset), source = _a[0], offset = _a[1];
        var curves = source.curves.slice();
        var offsetCurves = curves.map(function (curve) { return adaptiveOffsetCurve(curve, offset); }).flat();
        var raws = [];
        for (var i = 0; i < offsetCurves.length; i += 2) {
            raws.push(offsetCurves.slice(i, i + 2));
        }
        var segments = connectBeziers(raws, join, source, offset, limit).flat();
        var newPath = removeIntersection(new paper.Path({ segments: segments, insert: false, closed: path.closed }));
        newPath.reduce({});
        if (source.closed && ((source.clockwise && offset < 0) || (!source.clockwise && offset > 0))) {
            removeOutsiders(newPath, path);
        }
        // recovery path
        if (source.clockwise !== path.clockwise) {
            newPath.reverse();
        }
        return normalize(newPath);
    }
    function makeRoundCap(from, to, offset) {
        var origin = from.point.add(to.point).divide(2);
        var normal = to.point.subtract(from.point).rotate(-90, new paper.Point(0, 0)).normalize(offset);
        var through = origin.add(normal);
        var arc = new paper.Path.Arc({ from: from.point, to: to.point, through: through, insert: false });
        return arc.segments;
    }
    function connectSide(outer, inner, offset, cap) {
        if (outer instanceof paper.CompoundPath) {
            var cs = outer.children.map(function (c) { return ({ c: c, a: Math.abs(c.area) }); });
            cs = cs.sort(function (c1, c2) { return c2.a - c1.a; });
            outer = cs[0].c;
        }
        var oSegments = outer.segments.slice();
        var iSegments = inner.segments.slice();
        switch (cap) {
            case 'round':
                var heads = makeRoundCap(iSegments[iSegments.length - 1], oSegments[0], offset);
                var tails = makeRoundCap(oSegments[oSegments.length - 1], iSegments[0], offset);
                var result = new paper.Path({ segments: heads.concat(oSegments, tails, iSegments), closed: true, insert: false });
                result.reduce({});
                return result;
            default: return new paper.Path({ segments: oSegments.concat(iSegments), closed: true, insert: false });
        }
    }
    function offsetSimpleStroke(path, offset, join, cap, limit) {
        offset = path.clockwise ? offset : -offset;
        var positiveOffset = offsetSimpleShape(path, offset, join, limit);
        var negativeOffset = offsetSimpleShape(path, -offset, join, limit);
        if (path.closed) {
            return positiveOffset.subtract(negativeOffset, { insert: false });
        }
        else {
            var inner = negativeOffset;
            var holes = new Array();
            if (negativeOffset instanceof paper.CompoundPath) {
                holes = negativeOffset.children.filter(function (c) { return c.closed; });
                holes.forEach(function (h) { return h.remove(); });
                inner = negativeOffset.children[0];
            }
            inner.reverse();
            var final = connectSide(positiveOffset, inner, offset, cap);
            if (holes.length > 0) {
                for (var _i = 0, holes_1 = holes; _i < holes_1.length; _i++) {
                    var hole = holes_1[_i];
                    final = final.subtract(hole, { insert: false });
                }
            }
            return final;
        }
    }
    function getNonSelfItersectionPath(path) {
        if (path.closed) {
            return path.unite(path, { insert: false });
        }
        return path;
    }
    function offsetPath(path, offset, join, limit) {
        var nonSIPath = getNonSelfItersectionPath(path);
        var result = nonSIPath;
        if (nonSIPath instanceof paper.Path) {
            result = offsetSimpleShape(nonSIPath, offset, join, limit);
        }
        else {
            var offsetParts = nonSIPath.children.map(function (c) {
                if (c.segments.length > 1) {
                    if (!isSameDirection(c, path)) {
                        c.reverse();
                    }
                    var offseted = offsetSimpleShape(c, offset, join, limit);
                    offseted = normalize(offseted);
                    if (offseted.clockwise !== c.clockwise) {
                        offseted.reverse();
                    }
                    if (offseted instanceof paper.CompoundPath) {
                        offseted.applyMatrix = true;
                        return offseted.children;
                    }
                    else {
                        return offseted;
                    }
                }
                else {
                    return null;
                }
            });
            var children = offsetParts.flat().filter(function (c) { return !!c; });
            result = new paper.CompoundPath({ children: children, insert: false });
        }
        result.copyAttributes(nonSIPath, false);
        result.remove();
        return result;
    }
    function offsetStroke(path, offset, join, cap, limit) {
        var nonSIPath = getNonSelfItersectionPath(path);
        var result = nonSIPath;
        if (nonSIPath instanceof paper.Path) {
            result = offsetSimpleStroke(nonSIPath, offset, join, cap, limit);
        }
        else {
            var children = nonSIPath.children.flatMap(function (c) {
                return offsetSimpleStroke(c, offset, join, cap, limit);
            });
            result = children.reduce(function (c1, c2) { return c1.unite(c2, { insert: false }); });
        }
        result.strokeWidth = 0;
        result.fillColor = nonSIPath.strokeColor;
        result.shadowBlur = nonSIPath.shadowBlur;
        result.shadowColor = nonSIPath.shadowColor;
        result.shadowOffset = nonSIPath.shadowOffset;
        return result;
    }
  
    var PaperOffset = /** @class */ (function () {
        function PaperOffset() {
        }
        PaperOffset.offset = function (path, offset, options) {
            options = options || {};
            var newPath = offsetPath(path, offset, options.join || 'miter', options.limit || 10);
            if (options.insert === undefined) {
                options.insert = true;
            }
            if (options.insert) {
                (path.parent || paper.project.activeLayer).addChild(newPath);
            }
            return newPath;
        };
        PaperOffset.offsetStroke = function (path, offset, options) {
            options = options || {};
            var newPath = offsetStroke(path, offset, options.join || 'miter', options.cap || 'butt', options.limit || 10);
            if (options.insert === undefined) {
                options.insert = true;
            }
            if (options.insert) {
                (path.parent || paper.project.activeLayer).addChild(newPath);
            }
            return newPath;
        };
        return PaperOffset;
    }());
    
    
    paper.PaperOffset = {
        offset: PaperOffset.offset,
        offsetStroke: PaperOffset.offsetStroke,
    };
  
  }(paper));


  ///// **********


  