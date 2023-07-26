import {AnnotationUITool, AnnotationUIToolbarBase} from './annotationUITool.mjs';
export class RasterTool extends AnnotationUITool{
    constructor(paperScope){
        super(paperScope);

        this.setToolbarControl(new RasterToolbar(this));
    }
    rasterize(){
        let self = this;
        let item = this.item;
        if(item){
            let raster = this.project.overlay.osdViewer.getViewportRaster(item.view);
            item.layer.addChild(raster);
            
            raster.onLoad = function(){
                //get the subregion in pixel coordinates of the large raster by inverse transforming the bounding rect of the item
                let offset = new paper.Point(this.width/2,this.height/2);
                let newBounds = new paper.Rectangle(
                    offset.add(this.matrix.inverseTransform(item.bounds.topLeft)).floor(), 
                    offset.add(this.matrix.inverseTransform(item.bounds.bottomRight)).ceil()
                );
                
                let subraster = this.getSubRaster(newBounds);
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
class RasterToolbar extends AnnotationUIToolbarBase{
    constructor(tool){
        super(tool);
        let html=$('<i>',{class:'fa fa-image'})[0];
        this.button.configure(html,'Raster Tool');
        let d = $('<div>').appendTo(this.dropdown);
        let button = $('<button>').text('Convert to raster').appendTo(d);
        let span = $('<span>').text('Warning: this cannot be undone!').appendTo(d);

        button.on('click',()=>tool.rasterize())
    }
    isEnabledForMode(mode){
        return ['MultiPolygon','Point:Rectangle','Point:Ellipse'].includes(mode);
    }
}