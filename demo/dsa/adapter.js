function DSAAnnotationToGeoJSONFeatureCollection(dsa){
    console.log('Converting from DSA:',dsa);
    let metadata = Object.assign({}, dsa);
    delete metadata['annotation'];

    let fc = {
        type: 'FeatureCollection',
        features: dsa.annotation.elements.map(elementToFeature),
        label: dsa.annotation.name,
    };

    return fc;
}
function GeoJSONFeatureCollectionToDSAAnnotation(geojson){


}
function elementToFeature(element){
    function mapElementToGeometryType(e){
        let g = {
            type:null,
            coordinates:[],
            properties:{}
        };
        

        if(e.type == 'polyline' && e.closed == true){
            g.type = 'Polygon';
            g.coordinates = [e.points];
        } else if (e.type == 'polyline' && e.closed == false){
            g.type = 'LineString';
            g.coordinates = [e.points];
        } else if (e.type == 'arrow'){
            g.type = 'LineString';
            g.coordinates = [e.points];
            g.properties.subtype = 'Arrow';
        } else if (e.type == 'rectangle'){
            g.type = 'Point';
            g.properties.subtype = 'Rectangle';
            g.coordinates=e.center.slice(0,2);
        } else if (e.type == 'rectanglegrid'){
            g.type = 'Point';
            g.properties.subtype = 'RectangleGrid';
            g.coordinates=e.center.slice(0,2);
        } else if (e.type == 'circle'){
            g.type = 'Point';
            g.properties.subtype = 'Circle';
            g.coordinates=e.center.slice(0,2);
        } else if (e.type == 'ellipse'){
            g.type = 'Point';
            g.properties.subtype = 'Ellipse';
            g.coordinates=e.center.slice(0,2);
        } else if (e.type == 'point'){
            g.type = 'Point';
            g.coordinates=e.center.slice(0,2);
        }
        return g.type ? g : error('No GeoJSON Geometry defined for annotation type',e);
    }
    let f = {
        type:'Feature',
        geometry:mapElementToGeometryType(element),
        properties:{
            dsa_metadata:Object.assign({},element),
            fillColor:element.fillColor,
            strokeColor:element.lineColor,
            label:element.label.value,
        }
    };
    delete f.properties.dsa_metadata['type'];
    delete f.properties.dsa_metadata['points'];
    delete f.properties.dsa_metadata['closed'];
    
    return f;
}