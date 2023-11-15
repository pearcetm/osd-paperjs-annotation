import {AnnotationUITool, AnnotationUIToolbarBase} from './annotationUITool.mjs';
/**
 * The RasterTool class extends the AnnotationUITool and provides functionality for rasterizing annotations.
 * @extends AnnotationUITool
 * @class
 * @memberof OSDPaperjsAnnotation
 */
class RasterTool extends AnnotationUITool{
    /**
   * Creates a new RasterTool instance.
   * The constructor initializes the RasterTool by calling the base class (AnnotationUITool) constructor and sets up the necessary toolbar control (RasterToolbar).
   * @memberof OSDPaperjsAnnotation.RasterTool
   * @constructor
   * @param {paper.PaperScope} paperScope - The Paper.js scope for the tool.
   */
    constructor(paperScope){
        super(paperScope);

        this.setToolbarControl(new RasterToolbar(this));
    }
    /**
     * Rasterizes the current annotation item. It converts the vector annotation to a pixel-based raster.
     * After rasterization, it replaces the original annotation with the rasterized version.
     * The rasterized version includes both the raster image and the original annotation's geoJSON data.
     * @property {function} onLoad The function performs rasterization and replacement of the vector annotation with the rasterized version.
     * @property {Object} geoJSON geoJSON data representing the rasterized annotation item.
     * @property {string} geoJSON.type - The type of the geoJSON object (e.g., 'Feature').
     * @property {Object} geoJSON.geometry - The geometry information of the geoJSON object.
     * @property {string} geoJSON.geometry.type - The type of the geometry (e.g., 'GeometryCollection').
     * @property {Object} geoJSON.geometry.properties - Additional properties of the geometry.
     * @property {string} geoJSON.geometry.properties.subtype - The subtype of the geometry (e.g., 'Raster').
     * @property {Object} geoJSON.geometry.properties.raster - The raster data of the geometry.
     * @property {paper.Raster} geoJSON.geometry.properties.raster.data - The pixel-based raster data.
     * @property {Object} geoJSON.geometries - The list of geometries in the geometry collection.
     * @property {Object} geoJSON.properties - The properties of the geoJSON object.
     *
     */
    rasterize(){
        let self = this;
        let item = this.item;
        if(item){
            let raster = this.project.overlay.getViewportRaster();
            item.layer.addChild(raster);
        
        
            raster.onLoad = function(){
                //get the subregion in pixel coordinates of the large raster by inverse transforming the bounding rect of the item
                let offset = new paper.Point(this.width/2,this.height/2);
                
                let newBounds = new paper.Rectangle(
                    offset.add(this.matrix.inverseTransform(this.layer.matrix.transform(item.bounds.topLeft))).floor(), 
                    offset.add(this.matrix.inverseTransform(this.layer.matrix.transform(item.bounds.bottomRight))).ceil()
                );
                
                let subraster = this.getSubRaster(newBounds);
                
                subraster.transform(this.layer.matrix.inverted());
                
                subraster.selectedColor = null;
                let geoJSON = {
                    type:'Feature',
                    geometry:{
                        type:'GeometryCollection',
                        properties:{
                            subtype:'Raster',
                            raster: {
                                data:subraster,
                            },
                        },
                        geometries:[
                            item,
                        ]
                    },
                    properties:{}
                }

                item.replaceWith(paper.Item.fromGeoJSON(geoJSON));
                self.refreshItems();

                this.remove();
            }
        }

    }
    
}
export {RasterTool};
/**
 * The RasterToolbar class extends the AnnotationUIToolbarBase and provides the toolbar functionality for the RasterTool.
 * @extends AnnotationUIToolbarBase
 * @class 
 * @memberof OSDPaperjsAnnotation.RasterTool
 */
class RasterToolbar extends AnnotationUIToolbarBase{
   /**
   * The constructor sets up the toolbar UI with a button to trigger rasterization.
   * It also adds a warning message regarding the irreversible nature of rasterization.   * @constructor
   * @param {RasterTool} tool - The RasterTool instance.
   */
    constructor(tool){
        super(tool);
        let html=$('<i>',{class:'fa fa-image'})[0];
        this.button.configure(html,'Raster Tool');
        let d = $('<div>').appendTo(this.dropdown);
        let button = $('<button>').text('Convert to raster').appendTo(d);
        let span = $('<span>').text('Warning: this cannot be undone!').appendTo(d);

        button.on('click',()=>tool.rasterize())
    }
    /**
   * Checks if the RasterTool is enabled for the given mode.
   * @function
   * @param {string} mode - The mode of the annotation, such as 'MultiPolygon', 'Point:Rectangle', or 'Point:Ellipse'.
   * @returns {boolean} - Returns true if the RasterTool is enabled for the given mode, false otherwise.
   */
    isEnabledForMode(mode){
        return ['MultiPolygon','Point:Rectangle','Point:Ellipse'].includes(mode);
    }
}