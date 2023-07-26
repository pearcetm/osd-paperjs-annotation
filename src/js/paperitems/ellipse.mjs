import { AnnotationItem } from "./annotationitem.mjs";

export class Ellipse extends AnnotationItem{
    constructor(geoJSON){
        super(geoJSON);

        if (geoJSON.geometry.type !== 'Point' || geoJSON.geometry.properties.subtype !== 'Ellipse') {
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
            let a = props.majorRadius || 0;
            let b = props.minorRadius || 0;
            let degrees = props.angle || 0;
            
            let ellipse = new paper.Path.Ellipse({
                center: new paper.Point(x, y),
                radius: new paper.Size(a, b)
            })
            poly.addChild(ellipse);
            poly.rotate(degrees);
            
        }
        
        
        poly.canBeBoundingElement = true;

        this.paperItem = poly;
    }
    static get supportsType(){
        return {
            type: 'Point',
            subtype: 'Ellipse'
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
        let ax1 = points[2].subtract(points[0]);
        let ax2 = points[3].subtract(points[1]);
        let a, b;
        if(ax1.length > ax2.length){
            a = ax1;
            b = ax2;
        } else {
            a = ax2;
            b = ax1;
        }

        let angle = a.angle;
        return {
            majorRadius: a.length/2,
            minorRadius: b.length/2,
            angle: angle
        };
    }

    static onTransform(){
        let operation = arguments[0];
        switch(operation){
            case 'complete':{
                let curves = this.children[0].curves;
                let center = this.bounds.center;
                //take two adjacent curves (of the four total) and find the point on each closest to the center
                let nearpoints = curves.slice(0, 2).map(curve=>{
                    return {
                        curve: curve,
                        location: curve.getNearestLocation(center),
                    }
                }).sort((a,b) => a.location.distance - b.location.distance);
                
                let closest = nearpoints[0].location.point;
                if(closest.equals(nearpoints[0].curve.segment1.point) || closest.equals(nearpoints[0].curve.segment2.point)){
                    //no recalculation of points/axes required, the nearest point is already one of our existing points, just return
                    return;
                }
                
                let t = nearpoints[0].location.curve == nearpoints[0].curve ? nearpoints[0].location.time : 1;//if owned by the other curve, time == 1 by definition
                let b = closest.subtract(center);//minor axis
                let a = nearpoints[1].curve.getLocationAtTime(t).point.subtract(center);//major axis
                let ellipse = new paper.Path.Ellipse({center:center, radius: [a.length, b.length]}).rotate(a.angle);
                this.children[0].set({segments: ellipse.segments});
                break;
            }
        }
    }

}
