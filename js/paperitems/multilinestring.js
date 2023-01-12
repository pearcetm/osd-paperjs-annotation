import { AnnotationItem } from "./annotationitem.js";

export class MultiLinestring extends AnnotationItem{
    constructor(geoJSON){
        super(geoJSON);

        if (geoJSON.geometry.type !== 'MultiLineString') {
            error('Bad geoJSON object: type !=="MultiLineString"');
        }
        let coords = geoJSON.geometry.coordinates; //array of points
        let paths = coords.map(function (points, index) {
            let pts = points.map(function (point) {
                return new paper.Point(point[0], point[1]);
            });
            let path = new paper.Path(pts);
            path.strokeWidth = geoJSON.geometry.properties.strokeWidths[index];
            return new paper.Path(pts);
        });
    
        let grp = new paper.Group({
            children: paths
        });
        
        grp.fillColor = null;

        this.paperItem = grp;
    
    }
    static get supportsType(){
        return {
            type: 'MultiLineString',
        }
    }
    getCoordinates(){
        let item = this.paperItem;
        return item.children.map(function (c) { return c.segments.map(function (s) { return [s.point.x, s.point.y]; }); });
    }
    getProperties(){
        let item = this.paperItem;
        return {
            strokeColor: item.children.length>0 ? item.children[0].strokeColor : undefined,
            strokeWidths: item.children.map(c => c.strokeWidth),
        }
    }
    getStyleProperties(){
        return this.paperItem.children[0].style.toJSON();
    }
    setStyle(properties){
        Object.assign({},properties);
        if(properties.rescale){
            delete properties.rescale['strokeWidth'];
        }
        this._paperItem.style.set(properties);
    }
}
