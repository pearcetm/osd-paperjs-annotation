import { AnnotationItem } from "./annotationitem.mjs";

/**
 * Represents a linestring annotation item.
 * @class
 * @memberof OSDPaperjsAnnotation
 * @extends AnnotationItem
 * @description The `Linestring` class represents a linestring annotation item. It inherits from the `AnnotationItem` class and provides methods to work with linestring annotations.
 */
class Linestring extends AnnotationItem{
    /**
     * Create a new Linestring instance.
     * @param {Object} geoJSON - The GeoJSON object containing annotation data.
     * @throws {string} Throws an error if the GeoJSON type is invalid.
     * @property {paper.Group} _paperItem - The associated paper item representing the linestring.
     * @description This constructor initializes a new linestring annotation item based on the provided GeoJSON object.
     */
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
    /**
     * Retrieves the supported types by the Linestring annotation item.
     * @static
     * @returns {Object} An object with type property.
     * @description This static method provides information about the supported type by the Linestring annotation item class.
     */
    static get supportsType(){
        return {
            type: 'LineString',
        }
    }
        /**
     * Retrieves the coordinates of the linestring.
     * @returns {Array} An array of arrays containing x and y coordinates of each point.
     * @description This method returns an array of arrays representing the coordinates of each point in the linestring.
     */
    getCoordinates(){
        let item = this.paperItem;
        return item.children.map(function (c) { return c.segments.map(function (s) { return [s.point.x, s.point.y]; }); });
    }
    /**
     * Retrieves the style properties of the linestring.
     * @returns {Object} The style properties in JSON format.
     * @description This method returns the style properties of the linestring in JSON format.
     */
    getProperties(){
        let item = this.paperItem;
        return {
            strokeWidths: item.children.map(c => c.strokeWidth),
        }
    }
    /**
     * Sets the style properties of the linestring.
     * @param {Object} properties - The style properties to set.
     * @description This method sets the style properties of the linestring using the provided properties object.
     */
    setStyle(properties){
        Object.assign({},properties);
        if(properties.rescale){
            delete properties.rescale['strokeWidth'];
        }
        this._paperItem.style.set(properties);
    }
}
export{Linestring};
