import { AnnotationItem } from "./annotationitem.mjs";

export class PointText extends AnnotationItem{
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
    setStyle(props){
        //override default implementation so it doesn't overwrite the rescale properties
        // let rescale = props.rescale;
        // delete props.rescale;
        props.rescale = OpenSeadragon.extend(true, props.rescale, this.paperItem.rescale);
        this.paperItem.style.set(props);
        this.paperItem.children[0].style.set(props);
    }
    get textitem(){
        return this.paperItem.children[1];
    }


    static get supportsType(){
        return {
            type: 'Point',
            subtype:'PointText',
        }
    }
    getCoordinates(){
        let item = this.paperItem;
        let circle = item.children[0];
        return [circle.bounds.center.x, circle.bounds.center.y];
    }
    getProperties(){
        let item = this.paperItem;
        return {
            content: item.children[1].content,
        };
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
    
}
