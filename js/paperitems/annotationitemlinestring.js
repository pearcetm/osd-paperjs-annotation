
class AnnotationItemLinestring{
    constructor(geoJSON){
        if (geoJSON.geometry.type !== 'LineString') {
            error('Bad geoJSON object: type !=="LineString"');
        }
        let coords = geoJSON.geometry.coordinates; //array of points
        let paths = coords.map(function (points) {
            let pts = points.map(function (point) {
                return new paper.Point(point[0], point[1]);
            });
            return new paper.Path(pts);
        });
    
        let grp = new paper.Group({
            children: paths
        });
        grp.config = geoJSON;
        grp.config.properties.rescale && (delete grp.config.properties.rescale.strokeWidth);
        // grp.applyProperties();
        grp.fillColor = null;
        grp.isLineString = true;
    
        grp.toGeoJSONGeometry = function () {
            let g = this.config.geometry;
            g.coordinates = this.children.map(function (c) { return c.segments.map(function (s) { return [s.point.x, s.point.y]; }); });
            this.config.properties.strokeWidths = this.children.map(c => c.strokeWidth);
            return g;
        };

        grp.displayName = geoJSON.properties.label ? [geoJSON.properties.label,'label-property'] : ['LineString','geometry-type'];
        
        return grp;
    }
}

export {AnnotationItemLinestring}