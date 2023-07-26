import { AnnotationItem } from "./annotationitem.mjs";

export class Rectangle extends AnnotationItem{
    constructor(geoJSON){
        super(geoJSON);

        if (geoJSON.geometry.type !== 'Point' || geoJSON.geometry.properties.subtype !== 'Rectangle') {
            error('Bad geoJSON object: type !=="Point" or subtype !=="Rectangle"');
        }
        

        let poly = new paper.CompoundPath({
            children: [],
            fillRule: 'evenodd',
        });

        if(geoJSON.geometry.coordinates.length > 1){
            let center = geoJSON.geometry.coordinates.slice(0, 2);
            let x = center[0] || 0;
            let y = center[1] || 0;
            let props = geoJSON.geometry.properties;
            let w = props.width || 0;
            let h = props.height || 0;
            let degrees = props.angle || 0;
            
            let corners = [ [x - w/2, y - h/2], [x + w/2, y - h/2], [x + w/2, y + h/2], [x - w/2, y + h/2] ]; //array of array of points
            let pts = corners.map(function (point) {
                return new paper.Point(point[0], point[1]);
            });
            let path = new paper.Path(pts);
            poly.addChild(path);
            poly.closed = true;

            poly.rotate(degrees);
        }
        
        
        poly.canBeBoundingElement = true;

        this.paperItem = poly;
    }
    static get supportsType(){
        return {
            type: 'Point',
            subtype: 'Rectangle'
        }
    }
    getCoordinates(){
        let item = this.paperItem;
        return [item.position.x, item.position.y];
    }
    getProperties(){
        let item = this.paperItem;
        let path = item.children[0];
        let points = path.segments.map(s=>s.point);
        let top = points[1].subtract(points[0]);
        let left = points[0].subtract(points[3]);
        let w = top.length;
        let h = left.length;
        let angle = top.angleInDegrees;
        return {
            width: w,
            height: h,
            angle: angle
        };
    }

    static onTransform(){
        let operation = arguments[0];
        switch(operation){
            case 'rotate':{
                let segments = this.children[0].segments;
                segments.map((s, i) => {
                    let c = s.point.transform(this.matrix);
                    let s2 = segments[(i+1) % 4];
                    let c2 = s2.point.transform(this.matrix);
                    let vec = c2.subtract(c).divide(2);
                    let mp = c.add(vec);//.transform(this.matrix); 
                    
                    mp.normal = vec.rotate(-90).normalize();
                    mp.segments = [s, s2];
                    return mp;
                });
                break;
            }
            case 'scale':{
                let p = arguments[1]; //reference position
                let r = arguments[2]; //rotation
                let m = arguments[3]; //matrix

                this.matrix.append(m.inverted()); //undo previous operation
                
                //scale the midpoints of each edge of the rectangle per the transform operation
                //while projecting the operation onto the normal vector, to maintain rectanglar shape 
                let segments = this.children[0].segments;
                segments.map((s, i) => {
                    let c = s.point.transform(this.matrix);
                    let s2 = segments[(i+1) % 4];
                    let c2 = s2.point.transform(this.matrix);
                    let vec = c2.subtract(c).divide(2);
                    let mp = c.add(vec);
                    
                    mp.normal = vec.rotate(-90).normalize();
                    mp.segments = [s, s2];
                    return mp;
                }).forEach((midpoint) => {
                    let a = midpoint.subtract(p);
                    let ar = a.rotate(-r); 
                    let br = ar.multiply(m.scaling);
                    let b = br.rotate(r);
                    let delta = b.subtract(a);
                    let proj = delta.project(midpoint.normal);
                    
                    midpoint.segments.forEach(s=>{
                        let pt = s.point.transform(this.matrix).add(proj);
                        s.point = this.matrix.inverseTransform(pt);
                    })
                })
                break;
            }
        }
    }

}
