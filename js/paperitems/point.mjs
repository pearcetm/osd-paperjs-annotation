import { AnnotationItem } from "./annotationitem.mjs";

export class Point extends AnnotationItem{
    constructor(geoJSON){
        super(geoJSON);

        if (geoJSON.geometry.type !== 'Point') {
            error('Bad geoJSON object: type !=="Point"');
        }
        let radius = 8.0;
        let coords = geoJSON.geometry.coordinates.slice(0, 2);
        
        let point = new paper.Group();
        point.pivot = new paper.Point(0,0);
        point.applyMatrix = true;
        
        let circle = new paper.Path.Circle(new paper.Point(0, 0), radius);
        circle.scale(new paper.Point(1, 0.5), new paper.Point(0, 0));
    
        point.addChild(circle);
    
    
        let textitem = new paper.PointText({
            point: new paper.Point(0, 0),
            pivot: new paper.Point(0, 0),
            content: this.iconText,
            fontFamily: this.iconFontFamily,
            fontWeight: this.iconFontWeight,
            fontSize: 18,
            strokeWidth: 1, //keep this constant
        });
        point.addChild(textitem);

        //to-do: make this automatic somehow, instead of hard-coded...
        //the problem is that the bounding box of the text for some reason is not tight to the visual object.
        textitem.translate(new paper.Point(-6, -2)); 
    
        point.position = new paper.Point(...coords);
        point.scaleFactor = point.project._scope.scaleByCurrentZoom(1);
        point.scale(point.scaleFactor, circle.bounds.center);
        textitem.strokeWidth = point.strokeWidth / point.scaleFactor;
    
        point.rescale = point.rescale || {};
    
        point.rescale.size = function (z) {
            point.scale(1 / (point.scaleFactor * z));
            point.scaleFactor = 1 / z;
            textitem.strokeWidth = 1; //keep constant; reset after strokewidth is set on overall item
        };
        
        point.rotate(-point.view.getRotation());
        point.view.on('rotate',function(ev){point.rotate(-ev.rotatedBy)});
        point.applyRescale();
        
        this.paperItem = point;

        // define style getter/setter so that style propagates to/from children
        Object.defineProperty(point, 'style', {   
            get: ()=>{ return point.children[0].style },
            set: style=> { point.children.forEach(child=>child.style = style); }
        });
        // override fillOpacity property definition so that style getter/setter doesn't mess with fillOpacity
        Object.defineProperty(point, 'fillOpacity', {   
            get: function(){
                return this._style.fillOpacity;
            },
            set: function(opacity){
                this._style.fillOpacity = opacity;
            }
        });
        
    }
    setStyle(props){
        //override default implementation so it doesn't overwrite the rescale properties
        // let rescale = props.rescale;
        // delete props.rescale;
        props.rescale = OpenSeadragon.extend(true, props.rescale, this.paperItem.rescale);
        this.paperItem.style.set(props);
        // this.paperItem.children[0].style.set(props);
    }
    
    static get supportsType(){
        return {
            type: 'Point'
        }
    }
    getCoordinates(){
        let item = this.paperItem;
        let circle = item.children[0];
        return [circle.bounds.center.x, circle.bounds.center.y];
    }
    getStyleProperties(){
        return this.paperItem.children[0].style.toJSON();
    }
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

    get iconText(){
        if(!this._iconText){
            this._makeIcon();
        }
        return this._iconText;
    }
    get iconFontFamily(){
        if(!this._iconFontFamily){
            this._makeIcon();
        }
        return this._iconFontFamily;
    }
    get iconFontWeight(){
        if(!this._iconFontWeight){
            this._makeIcon();
        }
        return this._iconFontWeight;
    }

    //private
    _makeIcon(){
        //to-do: make the class(es) used to select a fontawesome icon a configurable option
        let domText = $('<i>', { class: 'fa-solid fa-map-pin', style: 'visibility:hidden;' }).appendTo('body');
        let computedStyle = window.getComputedStyle(domText[0], ':before');
        this._iconText = computedStyle.content.substring(1, 2);
        this._iconFontFamily = computedStyle.fontFamily;
        this._iconFontWeight = computedStyle.fontWeight;
        domText.remove();
    }
    
}
