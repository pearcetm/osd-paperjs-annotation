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

import { AnnotationItem } from "./annotationitem.mjs";
import { OpenSeadragon } from '../osd-loader.mjs';

/**
 * Represents a point with text annotation item.
 * @class
 * @memberof OSDPaperjsAnnotation
 * @extends AnnotationItem
 * @description The `PointText` class represents a point with text annotation item. It inherits from the `AnnotationItem` class and provides methods to work with point text annotations.
 */
class PointText extends AnnotationItem{
     /**
     * Create a new PointText instance.
     * @param {Object} geoJSON - The GeoJSON object containing annotation data.
     * @property {paper.Group} _paperItem - The associated paper item representing the point with text.
     * @description This constructor initializes a new point with text annotation item based on the provided GeoJSON object.
     */
    constructor(geoJSON){
        super(geoJSON);

        if (geoJSON.geometry.type !== 'Point') {
            error('Bad geoJSON object: type !=="Point"');
        }
        let radius = 4.0;
        let coords = geoJSON.geometry.coordinates.slice(0, 2);
        
        let point = new paper.Group();
        point.pivot = new paper.Point(0,0);
        point.applyMatrix = true;
        
        let circle = new paper.Path.Circle(new paper.Point(0, 0), radius);
        // circle.scale(new paper.Point(1, 0.5), new paper.Point(0, 0));
    
        point.addChild(circle);
    
    
        let textitem = new paper.PointText({
            point: new paper.Point(0, 0),
            pivot: new paper.Point(0, 0),
            content: geoJSON.geometry.properties.content || 'PointText',
            // fontFamily: this.iconFontFamily,
            // fontWeight: this.iconFontWeight,
            fontSize: 18,
            strokeWidth: 1, //keep this constant
        });
        point.addChild(textitem);
        // To do: option to hide the point unless the text is moused over?
        // textitem.on({
        //     mouseenter: function(event) {
        //         circle.visible = true;
        //     },
        //     mouseleave: function(event) {
        //         circle.visible = false;
        //     }
        // });

        //to-do: make this automatic somehow, instead of hard-coded...
        //the problem is that the bounding box of the text for some reason is not tight to the visual object.
        textitem.translate(new paper.Point(-textitem.bounds.width/2, -(textitem.bounds.height/2))); 
        textitem.on('content-changed',function(){
            let boundsNoRotate = textitem.getInternalBounds();
            let offset = new paper.Point(-boundsNoRotate.width/2, -boundsNoRotate.height/2).divide(textitem.view.zoom).rotate(-textitem.view.getRotation());
            textitem.position = circle.bounds.center.add(offset);
        })
    
        point.position = new paper.Point(...coords);
        point.scaleFactor = point.project._scope.scaleByCurrentZoom(1);
        point.scale(point.scaleFactor, circle.bounds.center);
        // textitem.strokeWidth = point.strokeWidth / point.scaleFactor;
    
        point.rescale = point.rescale || {};
    
        point.rescale.size = function (z) {
            point.scale(1 / (point.scaleFactor * z));
            point.scaleFactor = 1 / z;
            textitem.strokeWidth = 0; //keep constant; reset after strokewidth is set on overall item
        };
        
        point.rotate(-point.view.getRotation());
        point.view.on('rotate',function(ev){point.rotate(-ev.rotatedBy)});
        point.applyRescale();
        
        this.paperItem = point;


    }
    /**
     * Set the style properties of the point with text.
     * @param {Object} props - The style properties to set.
     * @description This method sets the style properties of the point with text using the provided properties object.
     */
    setStyle(props){
        //override default implementation so it doesn't overwrite the rescale properties
        // let rescale = props.rescale;
        // delete props.rescale;
        props.rescale = OpenSeadragon.extend(true, props.rescale, this.paperItem.rescale);
        this.paperItem.style.set(props);
        // this.paperItem.children[0].style.set(props);
    }
    /**
     * Get the text item associated with the point.
     * @returns {paper.PointText} The associated text item.
     */
    get textitem(){
        return this.paperItem.children[1];
    }

    /**
     * Get the supported annotation types for the class.
     * @static
     * @returns {Object} The supported annotation types.
     */
    static get supportsType(){
        return {
            type: 'Point',
            subtype:'PointText',
        }
    }   

    /**
    * Get the coordinates of the point.
    * @returns {Array<number>} The coordinates of the point.
    */
    getCoordinates(){
        let item = this.paperItem;
        let circle = item.children[0];
        return [circle.bounds.center.x, circle.bounds.center.y];
    }
    /**
     * Get the properties of the point.
     * @returns {Object} The properties of the point.
     */
    getProperties(){
        let item = this.paperItem;
        return {
            content: item.children[1].content,
        };
    }
    /**
     * Get the style properties of the point.
     * @returns {Object} The style properties of the point.
     */
    getStyleProperties(){
        return this.paperItem.children[0].style.toJSON();
    }
    /**
     * Handle transformation operations on the point.
     * @static
     * @param {string} operation - The type of transformation operation.
     * @description This static method handles transformation operations on the point annotation.
     */
    static onTransform(){
        let operation = arguments[0];
        switch(operation){
            case 'rotate':{
                let angle = arguments[1];
                let center = arguments[2];
                this.rotate(-angle, center); //undo the rotation: return to original position and orientation
                let vector = this.position.subtract(center);
                let newpos = center.add(vector.rotate(angle));
                let delta = newpos.subtract(this.position);
                this.translate(delta);
                break;
            }
            case 'scale':{
                let p = arguments[1]; //reference position
                let r = arguments[2]; //rotation
                let m = arguments[3]; //matrix

                this.matrix.append(m.inverted()); //undo previous operation
                let pos = this.pivot.transform(this.matrix);
                // let pos = this.pivot;
                let a = pos.subtract(p); // initial vector, unrotated
                let ar = a.rotate(-r); // initial vector, rotated
                let br = ar.multiply(m.scaling); //scaled rotated vector
                let b = br.rotate(r); //scaled unrotated vector
                let delta = b.subtract(a); //difference between scaled and unscaled position

                this.translate(delta);
                break;
            }
        }
    }
    
}
export{PointText};

