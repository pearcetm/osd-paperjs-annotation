import { AnnotationItem } from "./annotationitem.js";

export class Placeholder extends AnnotationItem{
    constructor(geoJSON){
        super(geoJSON);
        
        this.paperItem = new paper.Path();
        // this.paperItem.style = this.paperItem.instructions = geoJSON;
        this.paperItem.style = geoJSON.properties;

        this.paperItem.initializeGeoJSONFeature = initialize;
    }
    static get supportsType(){
        return {
            type: null
        }
    }
    getCoordinates(){
        return [];
    }
    getProperties(){
        let item = this.paperItem;
        return item.style;
    }
    
}

function initialize(geoJSONGeometryType, geometrySubtype) {
    let item = this;
    // let geoJSON = item.instructions;
    let geoJSON = {
        geometry:{
            type: geoJSONGeometryType,
            coordinates: [],
            properties: {
                subtype:geometrySubtype,
            },
        },
        properties: item.style,
    };
    
    let newItem = paper.Item.fromGeoJSON(geoJSON);
    // newItem.selected=item.selected;
    item.replaceWith(newItem);
        
    return newItem;
}