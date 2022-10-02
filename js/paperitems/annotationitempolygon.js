
class AnnotationItemPolygon{
    constructor(geoJSON){
        this._rasterColor
        if (geoJSON.geometry.type !== 'Polygon') {
            error('Bad geoJSON object: type !=="Polygon"');
        }
        let coords = geoJSON.geometry.coordinates; //array of array of points
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
        
        poly.config = geoJSON;
        // poly.applyProperties();

        poly.canBeBoundingElement = true;


        poly.toGeoJSONGeometry = function () {
            let g = this.config.geometry;
            g.coordinates = this.children.map(function (c) { return c.segments.map(function (s) { return [s.point.x, s.point.y]; }); });
            return g;
        };

        if (geoJSON.geometry.properties && geoJSON.geometry.properties.subtype == 'Raster') {
            setTimeout(() => {
                let raster = new paper.Raster(geoJSON.geometry.properties.rasterdata);
                // raster.position = poly.position;
                raster.set({ matrix: geoJSON.geometry.properties.rastermatrix });
                // let grp = makeRaster(poly, raster);
                let grp = poly.makeRaster(raster);
                grp.set({ matrix: geoJSON.geometry.properties.matrix });
            }, 0);
        }
        let displayname = (geoJSON.geometry.properties && geoJSON.geometry.properties.subtype) || 'Polygon';
        poly.displayName = [displayname,'geometry-type'];

        poly.makeRaster = this.makeRaster;
        return poly;
    }
    makeRaster(raster) {
        let poly = this;
        raster.selectedColor = rasterColor;
        let grp = new paper.Group([]);
        grp.isAnnotationFeature = true;
        poly.isAnnotationFeature = false;
        grp.config = Object.assign({}, poly.config);
        grp.config.geometry.properties.subtype = 'Raster';
        poly.replace(grp);
        grp.addChild(poly);
        grp.addChild(raster);
        grp.clipped = true;
        poly.deselect();
        grp.select();
        grp.toGeoJSONGeometry = function () {
            let g = poly.toGeoJSONGeometry();
            this.config.geometry.coordinates = g.coordinates;
            this.config.geometry.properties.matrix = this.matrix.values;
            this.config.geometry.properties.rasterdata = raster.toDataURL();
            this.config.geometry.properties.rastermatrix = raster.matrix.values;
            return this.config.geometry;
        };
        
        grp.displayName = ['Raster','geometry-type'];
        return grp;
    }
}

export {AnnotationItemPolygon}

const rasterColor = new paper.Color(0,0,0,0);
