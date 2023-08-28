import { AnnotationItem } from "./annotationitem.mjs";

/**
 * Represents a multi-polygon annotation item.
 * @class
 * @memberof OSDPaperjsAnnotation
 * @extends AnnotationItem
 * @description The `MultiPolygon` class represents a multi-polygon annotation item. It inherits from the `AnnotationItem` class and provides methods to work with multi-polygon annotations.
 */
class MultiPolygon extends AnnotationItem{
    /**
     * Create a new MultiPolygon instance.
     * @param {Object} geoJSON - The GeoJSON object containing annotation data.
     * @throws {string} Throws an error if the GeoJSON type is invalid.
     * @property {paper.CompoundPath} _paperItem - The associated paper item representing the multi-polygon.
     * @description This constructor initializes a new multi-polygon annotation item based on the provided GeoJSON object.
     */
    constructor(geoJSON){
        super(geoJSON);

        if (geoJSON.geometry.type !== 'MultiPolygon') {
            error('Bad geoJSON object: type !=="MultiPolygon"');
        }
        //GeoJSON MultiPolygons are arrays of array of arrays of points
        //Flatten the first level so it's an array of array of points
        let coords = geoJSON.geometry.coordinates.flat();
        let paths = coords.map(function (points) {
            let pts = points.map(function (point) {
                return new paper.Point(point[0], point[1]);
            });
            return new paper.Path(pts);
        });

        let poly = new paper.CompoundPath({
            children: paths,
            fillRule: 'evenodd',
            closed: true,
        });

        poly = poly.replaceWith(poly.unite(poly).toCompoundPath());
        
        poly.canBeBoundingElement = true;

        this.paperItem = poly;
    }
    /**
     * Retrieves the supported types by the MultiPolygon annotation item.
     * @static
     * @returns {Object} An object with type property.
     * @description This static method provides information about the supported type by the MultiPolygon annotation item class.
     */
    static get supportsType(){
        return {
            type: 'MultiPolygon'
        }
    }
    /**
     * Retrieves the coordinates of the multi-polygon.
     * @returns {Array} An array of arrays representing the coordinates of the polygons and holes.
     * @description This method returns an array of arrays representing the coordinates of the polygons and their holes in the multi-polygon.
     */
    getCoordinates(){
        //filter out invalid children with less than 3 points
        let polygons = this.paperItem.children.filter(c=>c.area > 0 && c.segments.length>2);
        let holes = this.paperItem.children.filter(c=>c.area <= 0 && c.segments.length>2);
        let out = polygons.map(p => 
            [p.segments.map(s => [s.point.x, s.point.y]), ].concat(
                holes.filter(h=>p.contains(h.segments[0].point)).map(h=> h.segments.map(s=>[s.point.x, s.point.y])) )
        );
        //Close each polygon by making the first point equal to the last (if needed)
        out.forEach(polylist=>{
            polylist.forEach(array=>{
                let first = array[0];
                let last = array.slice(-1)[0];
                if(first[0]!==last[0] || first[1] !== last[1]){
                    array.push([first[0], first[1]]);
                }
            })
        })
        return out;
    }
    /**
     * Retrieves the properties of the multi-polygon.
     * @returns {undefined}
     * @description This method returns `undefined` since the MultiPolygon class does not have specific properties.
     */
    getProperties(){
        return;
    }
    
}
export{MultiPolygon};
