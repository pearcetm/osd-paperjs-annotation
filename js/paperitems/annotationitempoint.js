class AnnotationItemPoint{
    constructor(geoJSON){
        //TO DO: Add configuration options for
        // - base radius
        // - fontawesome icon class (or others...?)
        // - icon offset
        
        if (geoJSON.geometry.type !== 'Point') {
            error('Bad geoJSON object: type !=="Point"');
        }
        let radius = 8.0;
        let coords = geoJSON.geometry.coordinates.length == 2 ? geoJSON.geometry.coordinates : [0, 0];
        
        let point = new paper.Group();
        point.pivot = new paper.Point(0,0);
        point.applyMatrix = true;
        
        let circle = new paper.Path.Circle(new paper.Point(0, 0), radius);
        circle.scale(new paper.Point(1, 0.5), new paper.Point(0, 0));
    
        point.addChild(circle);
    
        //to-do: make the class(es) used to select a fontawesome icon a configurable option
        let domText = $('<i>', { class: 'fa-solid fa-map-pin', style: 'visibility:hidden;' }).appendTo('body');
        let computedStyle = window.getComputedStyle(domText[0], ':before');
        let text = computedStyle.content.substring(1, 2);
        let fontFamily = computedStyle.fontFamily;
        let fontWeight = computedStyle.fontWeight;
        domText.remove();
    
        let textitem = new paper.PointText({
            point: new paper.Point(0, 0),
            pivot: new paper.Point(0, 0),
            content: text,
            fontFamily: fontFamily,
            fontWeight: fontWeight,
            fontSize: 18,
            strokeWidth: 1, //keep this constant
        });
        point.addChild(textitem);
        textitem.translate(new paper.Point(-6, -2)); //to-do: make this automatic somehow, instead of hard-coded...
    
    
        //the problem is that the bounding box of the text for some reason is not tight to the visual object.
        point.config = geoJSON;
        // point.applyProperties();
    
        point.position = new paper.Point(...coords);
        point.scaleFactor = point.project._scope.scaleByCurrentZoom(1);
        point.scale(point.scaleFactor, circle.bounds.center);
        textitem.strokeWidth = point.strokeWidth / point.scaleFactor;
    
        point.rescale = point.rescale || {};
    
        point.rescale.size = function (z) {
            point.scale(1 / (point.scaleFactor * z));
            point.scaleFactor = 1 / z;
            textitem.strokeWidth = 1; //keep constant; reset after strokewidth is set on overall item
        };
    
        point.toGeoJSONGeometry = function () {
            let g = this.config.geometry;
            g.coordinates = [circle.bounds.center.x, circle.bounds.center.y];
            return g;
        };
        point.rotate(-point.view.getRotation());
        point.view.on('rotate',function(ev){point.rotate(-ev.rotatedBy)});
        point.applyRescale();
        point.displayName = ['Point','geometry-type'];
        return point;
    }
}
export {AnnotationItemPoint}
