/**
 * OpenSeadragon canvas Overlay plugin based on paper.js
 * @version 0.1.2
 * 
 * Includes additional open source libraries which are subject to copyright notices
 * as indicated accompanying those segments of code.
 * 
 * Original code:
 * Copyright (c) 2022-2023, Thomas Pearce
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

// Depends on OpenSeadragon global variable


Object.defineProperty(OpenSeadragon.Viewer.prototype, 'paperLayer', paperLayerDef());
Object.defineProperty(OpenSeadragon.TiledImage.prototype, 'paperLayer', paperLayerDef());
Object.defineProperty(OpenSeadragon.Viewport.prototype, 'paperLayer', paperLayerDef());
Object.defineProperty(OpenSeadragon.TiledImage.prototype, 'paperLayerMap', paperLayerMapDef());
Object.defineProperty(OpenSeadragon.Viewer.prototype, 'paperLayerMap', paperLayerMapDef());
Object.defineProperty(OpenSeadragon.Viewport.prototype, 'paperLayerMap', paperLayerMapDef());
Object.defineProperty(OpenSeadragon.Viewer.prototype, 'paperItems', paperItemsDef());
Object.defineProperty(OpenSeadragon.TiledImage.prototype, 'paperItems', paperItemsDef());
Object.defineProperty(OpenSeadragon.Viewport.prototype, 'paperItems', paperItemsDef());
OpenSeadragon.Viewer.prototype._setupPaper = _setupPaper;
OpenSeadragon.Viewport.prototype._setupPaper = _setupPaper;
OpenSeadragon.TiledImage.prototype._setupPaper = _setupPaperForTiledImage;
OpenSeadragon.Viewer.prototype.addPaperItem = addPaperItem;
OpenSeadragon.TiledImage.prototype.addPaperItem = addPaperItem;

/**
 * Define the paperItems property for a tiledImage.
 * @private
 * @returns {object} The property descriptor object.
 * @property {function} get - The getter function for paperItems.
 *   @returns {paper.Item[]} The array of paper item objects representing the items belonging to this TiledImage.
 */
function paperItemsDef(){
    return {
        get: function paperItems(){
            return this.paperLayer.children();
        }
    }
}


/**
 * @private _createPaperLayer
 */
function _createPaperLayer(osdObject, paperScope){
    let layer = new paper.Layer({applyMatrix:false});
    paperScope.project.addLayer(layer);
    osdObject.paperLayerMap.set(paperScope, layer);
    return layer;
}

/**
 * Define the paperLayer property for a tiledImage. Initializes the paper.Layer object the first time it is accessed.
 * @private
 * @returns {object} The property descriptor object.
 * @property {function} get - The getter function for paperGroup.
 *   @returns {paper.Layer} The group that serves as the parent of all paper items belonging to this TiledImage.
 */
function paperLayerDef(){
    return {
        get: function paperLayer(){
            let numScopes = this.paperLayerMap.size;
            if( numScopes === 1){
                return this.paperLayerMap.values().next().value;
            } else if (numScopes === 0){
                return null;
            } else {
                return this.paperLayerMap.get(paper) || null;
            }
        }
    }
}
/**
 * Define the _paperLayerMap property for a tiledImage. Initializes the Map object the first time it is accessed.
 * @private
 * @returns {object} The property descriptor object.
 * @property {function} get - The getter function for paperGroup.
 *   @returns {Map} The mapping from paper.Scope to the layer within the scope corresponding to this object
 */
function paperLayerMapDef(){
    return {
        get: function paperLayerMap(){
            if(!this._paperLayerMap){
                this._paperLayerMap = new Map();
            }
            return this._paperLayerMap;
        }
    }
}
/**
 * @private
 * 
 */
function _setupPaperForTiledImage(overlay){
    let layer = _setupPaper.call(this, overlay);
    let tiledImage = this;
    layer.tiledImage = tiledImage;
    // let scale = tiledImage.getBounds().width / tiledImage.getContentSize().x;
    // layer.setScaling(scale);
    // layer.setScaling(scale);
    let bounds = this.getBounds();
    // layer.translate({x: bounds.x * overlay.scaleFactor, y: bounds.y * overlay.scaleFactor});
    layer.matrix.translate({x: bounds.x * overlay.scaleFactor, y: bounds.y * overlay.scaleFactor});
    tiledImage.addHandler('bounds-change',ev=>{
        console.log('bounds-change',ev);
        console.log('TODO implement rotation and scaling');
        let bounds = this.getBounds();
        let t = layer.matrix.getTranslation();
        layer.matrix.translate({x: bounds.x * overlay.scaleFactor - t.x, y: bounds.y * overlay.scaleFactor - t.y});
        //TODO implement updating the layer's matrix with the new values
    });
}

/**
 * @private
 * @returns {paper.Layer}
 */
function _setupPaper(overlay){
    return _createPaperLayer(this, overlay.paperScope);
}


/**
 * @private addPaperItem
 */
function addPaperItem(item){
    if(this.paperLayer){
        this.paperLayer.addItem(item);
    } else {
        console.error('No layer has been set up in the active paper scope for this object. Does a scope need to be activated?');
    }
}
