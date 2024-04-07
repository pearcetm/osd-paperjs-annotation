/**
 * OpenSeadragon paperjs overlay plugin based on paper.js
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
 * * Neither the name of osd-paperjs-annotation nor the names of its
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

import { paper } from './paperjs.mjs';
import { OpenSeadragon } from './osd-loader.mjs';

// monkey patch to fix view.zoom when negative scaling is applied
paper.View.prototype.getZoom = function() {
    var scaling = this._decompose().scaling;
    // Use average since it can be non-uniform.
    return (Math.abs(scaling.x) + Math.abs(scaling.y)) / 2;
}

/**
 * Sets the rotation of the view.
 * @function setRotation
 * @memberof OSDPaperjsAnnotation.paperjsOverlay#
 * @param {number} degrees - The number of degrees to rotate.
 * @param {any} center - The center point of the rotation.
 */
paper.View.prototype.setRotation = function(degrees, center){
    let degreesToRotate = degrees - (this._rotation || 0)
    this.rotate(degreesToRotate, center);
    this._rotation = OpenSeadragon.positiveModulo(degrees, 360);
    this.emit('rotate',{rotatedBy:degreesToRotate, currentRotation:this._rotation, center:center});
}

/**
 * Sets the flip of the view.
 * @function setRotation
 * @memberof OSDPaperjsAnnotation.paperjsOverlay#
 * @param {Boolean} flipped - Whether the view is flipped or not.
 * @param { number } currentRotation - the current rotation of the viewer in degrees
 */
paper.View.prototype.setFlipped = function(flipped, currentRotation){
    const isFlipped = this.getFlipped();
    console.log(`setting flipped from ${isFlipped} to ${flipped}; rotation = ${currentRotation} degrees`);
    if(flipped !== isFlipped){
        this.rotate(-currentRotation);
        this.scale(-1, 1);
        this.rotate(currentRotation);
        this.emit('flip',{flipped: flipped});
    }
}

/**
 * Gets the current flipped status of the of the view.
 * @function setRotation
 * @memberof OSDPaperjsAnnotation.paperjsOverlay#
 * @param {Boolean} flipped - Whether the view is flipped or not.
 */
paper.View.prototype.getFlipped = function(flipped){
    return this.scaling.x * this.scaling.y < 0;
}

Object.defineProperty(paper.Item.prototype, 'hierarchy', hierarchyDef());
Object.defineProperty(paper.Item.prototype, 'descendants', descendantsDef());
Object.defineProperty(paper.Item.prototype, 'fillOpacity', itemFillOpacityPropertyDef());
Object.defineProperty(paper.Item.prototype, 'strokeOpacity', itemStrokeOpacityPropertyDef());
Object.defineProperty(paper.Item.prototype, 'rescale', itemRescalePropertyDef());
Object.defineProperty(paper.Item.prototype, 'stroke', strokePropertyDefItem());
Object.defineProperty(paper.Style.prototype, 'fillOpacity', fillOpacityPropertyDef());
Object.defineProperty(paper.Style.prototype, 'strokeOpacity', strokeOpacityPropertyDef());
Object.defineProperty(paper.Style.prototype, 'rescale', rescalePropertyDef());
Object.defineProperty(paper.CompoundPath.prototype, 'descendants', descendantsDefCompoundPath());//this must come after the Item prototype def to override it
Object.defineProperty(paper.Project.prototype, 'hierarchy', hierarchyDef());
Object.defineProperty(paper.Project.prototype, 'fillOpacity', itemFillOpacityPropertyDef());
Object.defineProperty(paper.View.prototype, 'fillOpacity', viewFillOpacityPropertyDef());
Object.defineProperty(paper.View.prototype, '_fillOpacity',{value: 1, writable: true});//initialize to opaque
Object.defineProperty(paper.Project.prototype, 'strokeOpacity', itemStrokeOpacityPropertyDef());

paper.Item.prototype.updateFillOpacity = updateFillOpacity;
paper.Item.prototype.updateStrokeOpacity = updateStrokeOpacity;
paper.Project.prototype.updateFillOpacity = updateFillOpacity;
paper.View.prototype._multiplyOpacity = true;
paper.Style.prototype.set= styleSet;
paper.Item.prototype.applyRescale = applyRescale;

/**
 * Define the set method for a paper style object.
 * @private
 * @param {object|paper.Style} style - The style object to set.
 */
function styleSet(style){

    var isStyle = style instanceof paper.Style,
        values = isStyle ? style._values : style;
    if (values) {
        for (var key in values) {
            // console.log('setting',key)
            if (key in this._defaults || paper.Style.prototype.hasOwnProperty(key)) {
                var value = values[key];
                this[key] = value && isStyle && value.clone
                        ? value.clone() : value ;
            }
        }
    }
	
}
/**
 * Item.updateFillOpacity (paper extension)
 * Update the fill opacity of a paper item and its descendants.
 */

function updateFillOpacity(){
    this._computedFillOpacity = this.hierarchy.filter(item=>'fillOpacity' in item && (item._multiplyOpacity||item==this)).reduce((prod,item)=>prod*item.fillOpacity,1);
    if(this.fillColor){
        this.fillColor.alpha = this._computedFillOpacity;
    }
}
/**
 * Item.updateStrokeOpacity (paper extension)
 * Update the stroke opacity of a paper item and its descendants.
 */
function updateStrokeOpacity(){
    if(this.strokeColor){
        this.strokeColor.alpha = this.hierarchy.filter(item=>'strokeOpacity' in item && (item._multiplyOpacity||item==this)).reduce((prod,item)=>prod*item.strokeOpacity,1);
    }
}
/**
 * Define the fill opacity property for a paper style object.
 * The fill opacity property controls the opacity of the fill color in a style object.
 * @private
 * @returns {object} The property descriptor object.
 * @property {function} set - The setter function for the fill opacity property.
 *   @param {number} o - The fill opacity value. Should be a number between 0 and 1.
 * @property {function} get - The getter function for the fill opacity property.
 *   @returns {number} The fill opacity value. If not set, returns 1 (fully opaque).
 */
function fillOpacityPropertyDef(){
    return {
        set: function opacity(o){
            this._fillOpacity = this._values.fillOpacity = o;
        },
        get: function opacity(){
            return typeof this._fillOpacity === 'undefined' ? 1 : this._fillOpacity;
        }
    }
}
/**
 * Define the stroke opacity property for a paper style object.
 * The stroke opacity property controls the opacity of the stroke color in a style object.
 * @private
 * @returns {object} The property descriptor object.
 * @property {function} set - The setter function for the stroke opacity property.
 *   @param {number} o - The stroke opacity value. Should be a number between 0 and 1.
 * @property {function} get - The getter function for the stroke opacity property.
 *   @returns {number} The stroke opacity value. If not set, returns 1 (fully opaque).
 */
function strokeOpacityPropertyDef(){
    return {
        set: function opacity(o){
            this._strokeOpacity = this._values.strokeOpacity = o;
        },
        get: function opacity(){
            return typeof this._strokeOpacity === 'undefined' ? 1 : this._strokeOpacity;
        }
    }
}
/**
 * Define the fill opacity property for a paper item object.
 * The fill opacity property defines the opacity of the fill color used in a paper item object's style.
 * @private
 * @returns {object} The property descriptor object.
 * @property {function} set - The setter function for the fill opacity property.
 *   @param {number} opacity - The opacity value for the fill color.
 * @property {function} get - The getter function for the fill opacity property.
 *   @returns {number} The opacity value of the fill color.
 */
function itemFillOpacityPropertyDef(){
    return {
        set: function opacity(o){
            (this.style || this.defaultStyle).fillOpacity = o;
            this.descendants.forEach(item=>item.updateFillOpacity())
        },
        get: function opacity(){
            return (this.style || this.defaultStyle).fillOpacity;
        }
    }
}

/**
 * Define the stroke opacity property for a paper item object.
 * The stroke opacity property defines the opacity of the stroke color used in a paper item object's style.
 * @private
 * @returns {object} The property descriptor object.
 * @property {function} set - The setter function for the stroke opacity property.
 *   @param {number} opacity - The opacity value for the stroke color.
 * @property {function} get - The getter function for the stroke opacity property.
 *   @returns {number} The opacity value of the stroke color.
 */
function itemStrokeOpacityPropertyDef(){
    return {
        set: function opacity(o){
            (this.style || this.defaultStyle).strokeOpacity = o;
            this.descendants.forEach(item=>item.updateStrokeOpacity())
        },
        get: function opacity(){
            return (this.style || this.defaultStyle).strokeOpacity;
        }
    }
}


/**
 * Define the fill opacity property for a paper view object.
 * The fill opacity property defines the opacity of the fill color used in a paper view object's style.
 * @private
 * @returns {object} The property descriptor object.
 * @property {function} set - The setter function for the fill opacity property.
 *   @param {number} opacity - The opacity value for the fill color.
 * @property {function} get - The getter function for the fill opacity property.
 *   @returns {number} The opacity value of the fill color.
 */
function viewFillOpacityPropertyDef(){
    return {
        set: function opacity(o){
            this._fillOpacity = o;
            this._project.descendants.forEach(item=>item.updateFillOpacity())
        },
        get: function opacity(){
            return this._fillOpacity;
        },
    }
}

/**
 * Define the rescale property for a paper style object.
 * The rescale property defines the scaling factor applied to a paper style object.
 * @private
 * @returns {object} The property descriptor object.
 * @property {function} set - The setter function for the rescale property.
 *   @param {number} rescale - The scaling factor value.
 * @property {function} get - The getter function for the rescale property.
 *   @returns {number} The scaling factor value.
 */
function rescalePropertyDef(){
    return {
        set: function rescale(o){
            this._rescale = this._values.rescale = o;
        },
        get: function rescale(){
            return this._rescale;
        }
    }
}

/**
 * Define the rescale property for a paper item object.
 * The rescale property defines the scaling factor applied to a paper item object's style.
 * @private
 * @returns {object} The property descriptor object.
 * @property {function} set - The setter function for the rescale property.
 *   @param {number} rescale - The scaling factor value.
 * @property {function} get - The getter function for the rescale property.
 *   @returns {number} The scaling factor value.
 */
function itemRescalePropertyDef(){
    return {
        set: function rescale(o){
            this._style.rescale = o;
        },
        get: function rescale(){
            return this._style.rescale;
        }
    }
}

/**
 * Define the hierarchy property for a paper item or project object.
 * The hierarchy property represents the parent-child relationship of paper item or project objects.
 * @private
 * @returns {object} The property descriptor object.
 * @property {function} get - The getter function for the hierarchy property.
 *   @returns {paper.Item[]} The array of paper item objects representing the hierarchy.
 */
function hierarchyDef(){
    return {
        get: function hierarchy(){
            return this.parent ? this.parent.hierarchy.concat(this) : this.project ? this.project.hierarchy.concat(this) : [this.view, this];
        }
    }
}
/**
 * Define the descendants property for a paper item or project object.
 * The descendants property represents all the descendants (children and their children) of a paper item or project object.
 * @private
 * @returns {object} The property descriptor object.
 * @property {function} get - The getter function for the descendants property.
 *   @returns {paper.Item[]} The array of paper item objects representing the descendants.
 */
function descendantsDef(){
    return {
        get: function descendants(){
            return (this.children ? this.children.map(child=>child.descendants).flat() : []).concat(this.isGeoJSONFeature ? [this] : []);
        }
    }
}
/**
 * Define the descendants property for a paper compound path object.
 * The descendants property represents the compound path object itself as its only descendant.
 * @private
 * @returns {object} The property descriptor object.
 * @property {function} get - The getter function for the descendants property.
 *   @returns {paper.Item[]} The array containing only the compound path object.
 */
function descendantsDefCompoundPath(){
    return {
        get: function descendants(){
            return [this];
        }
    }
}

function applyRescale(){
    let item = this;
    let rescale = item.rescale;
    if(rescale){
        // // this accounts for view level zoom as well as the scale of the tiled image itself
        // let zoomFactor = item.hierarchy.reduce((val, item)=>{
        //     return item.scaling ? item.scaling.x * val : val;
        // }, 1);

        let zoomFactor = item.view.scaling.x * item.layer.scaling.x;
        
        Object.keys(rescale).forEach(function(prop){
            if(typeof rescale[prop] ==='function'){
                item[prop] = rescale[prop](zoomFactor)
            } else {
                if(Array.isArray(rescale[prop])){
                    item[prop] = rescale[prop].map(function(i){return i/zoomFactor})
                } else {
                    item[prop] = rescale[prop]/zoomFactor;
                }
            } 
        });
    }
}

function strokePropertyDefItem(){
    return {
        get: function stroke(){
            return this._stroke;
        },
        set: function stroke(sw){
            this._stroke = sw;
            this.strokeWidth = sw / (this.view.getZoom() * this.hierarchy.filter(i=>i.tiledImage)[0].scaling.x);
        }
    }
}