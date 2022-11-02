import {AnnotationUITool, AnnotationUIToolbarBase} from './annotationUITool.js';
export class RasterTool extends AnnotationUITool{
    constructor(paperScope){
        super(paperScope);

        this.setToolbarControl(new RasterToolbar(this));
    }
    rasterize(){
        let poly = this.item;
        if(poly && poly.makeRaster){
            let raster = this.project.overlay.osdViewer.getViewportRaster(poly.view);
            poly.layer.addChild(raster);
            raster.selectedColor = 'green';
            raster.selected = true;
            
            raster.onLoad = function(){
                //get the subregion in pixel coordinates of the large raster by inverse transforming the bounding rect of the item
                let offset = new paper.Point(this.width/2,this.height/2);
                // let corners = [poly.bounds.topLeft, poly.bounds.topRight, poly.bounds.bottomRight, poly.bounds.bottomLeft];
                // console.log('Original bounds',corners);
                let corners = (poly.segments || poly.children.map(c=>c.segments).flat()).map(s=>s.point);
                let transformed = corners.map(point=>this.getMatrix().inverseTransform(point));
                // console.log('Transformed',transformed);
                let x = transformed.map(p=>p.x)
                let y = transformed.map(p=>p.y)
                let topLeft = new paper.Point(Math.min(...x), Math.min(...y));
                let bottomRight = new paper.Point(Math.max(...x), Math.max(...y));
                let tl = offset.add(topLeft);
                let br = offset.add(bottomRight);
                let newBounds = new paper.Rectangle(tl,br);
                console.log('new bounds',newBounds)
                let subraster = this.getSubRaster(newBounds);
                subraster.selectedColor = null;
                
                poly.makeRaster(subraster);
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
        return ['Polygon','Polygon:Rectangle'].includes(mode);
    }
}