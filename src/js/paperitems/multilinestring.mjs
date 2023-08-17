import { AnnotationItem } from "./annotationitem.mjs";

/**
 * Represents a multi-linestring annotation item.
 * @class
 * @memberof OSDPaperjsAnnotation
 * @extends AnnotationItem
 * @description The `MultiLinestring` class represents a multi-linestring annotation item. It inherits from the `AnnotationItem` class and provides methods to work with multi-linestring annotations.
 */
class MultiLinestring extends AnnotationItem{
    /**
     * Create a new MultiLinestring instance.
     * @param {Object} geoJSON - The GeoJSON object containing annotation data.
     * @throws {string} Throws an error if the GeoJSON type is invalid.
     * @property {paper.Group} _paperItem - The associated paper item representing the multi-linestring.
     * @description This constructor initializes a new multi-linestring annotation item based on the provided GeoJSON object.
     */
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
    /**
     * Retrieves the supported types by the MultiLinestring annotation item.
     * @static
     * @returns {Object} An object with type property.
     * @description This static method provides information about the supported type by the MultiLinestring annotation item class.
     */
    static get supportsType(){
        return {
            type: 'MultiLineString',
        }
    }
    /**
     * Retrieves the coordinates of the multi-linestring.
     * @returns {Array} An array containing arrays of x and y coordinates for each point.
     * @description This method returns an array of arrays representing the coordinates of each point in the multi-linestring.
     */
    getCoordinates(){
        let item = this.paperItem;
        return item.children.map(function (c) { return c.segments.map(function (s) { return [s.point.x, s.point.y]; }); });
    }
    /**
     * Retrieves the properties of the multi-linestring.
     * @returns {Object} The properties object.
     * @description This method returns the properties associated with the multi-linestring, including stroke color and widths.
     */
    getProperties(){
        let item = this.paperItem;
        return {
            strokeColor: item.children.length>0 ? item.children[0].strokeColor : undefined,
            strokeWidths: item.children.map(c => c.strokeWidth),
        }
    }
    /**
     * Retrieves the style properties of the multi-linestring.
     * @returns {Object} The style properties in JSON format.
     * @description This method returns the style properties of the multi-linestring in JSON format.
     */
    getStyleProperties(){
        return this.paperItem.children[0].style.toJSON();
    }
    /**
     * Apply style properties to the multi-linestring annotation item.
     * @param {Object} properties - The style properties to set.
     * @description This method applies the provided style properties to the multi-linestring annotation item.
     */
    setStyle(properties){
        Object.assign({},properties);
        if(properties.rescale){
            delete properties.rescale['strokeWidth'];
        }
        this._paperItem.style.set(properties);
    }
}
export{MultiLinestring};

