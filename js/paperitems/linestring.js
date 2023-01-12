import { AnnotationItem } from "./annotationitem.js";

export class Linestring extends AnnotationItem{
    constructor(geoJSON){
        super(geoJSON);

        if (geoJSON.geometry.type !== 'LineString') {
            error('Bad geoJSON object: type !=="LineString"');
        }
        let coords = geoJSON.geometry.coordinates; //array of points
        let pts = coords.map(function (point) {
            return new paper.Point(point[0], point[1]);
        });
    
        let grp = new paper.Group({
            children: [new paper.Path(pts)]
        });
        // grp.config = geoJSON;
        // grp.config.properties.rescale && (delete grp.config.properties.rescale.strokeWidth);
        
        grp.fillColor = null;

        this.paperItem = grp;
    
    }
    static get supportsType(){
        return {
            type: 'LineString',
        }
    }
    getCoordinates(){
        let item = this.paperItem;
        return item.children.map(function (c) { return c.segments.map(function (s) { return [s.point.x, s.point.y]; }); });
    }
    getProperties(){
        let item = this.paperItem;
        return {
            strokeWidths: item.children.map(c => c.strokeWidth),
        }
    }
    setStyle(properties){
        Object.assign({},properties);
        if(properties.rescale){
            delete properties.rescale['strokeWidth'];
        }
        this._paperItem.style.set(properties);
    }
}
