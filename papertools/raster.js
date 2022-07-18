import { ToolBase, ToolbarBase } from './base.js';
export class RasterTool extends ToolBase{
    constructor(project){
        super(project);
        let self=this;

        this.setToolbarControl(new RasterToolbar(this));
    }
    rasterize(){
        let poly = this.project.findSelectedPolygon();
        let mb = this.project.paperScope.view.projectToView(poly.bounds)
        let mx = mb.x;
        let my = mb.y;
        let mw = poly.bounds.width * this.project.getZoom();
        let mh = poly.bounds.height * this.project.getZoom();
        
        //Deal with pixel ratio other than one
        let r = ps.view.pixelRatio;
        let newcanvas = $('<canvas>').attr({width:mw*r,height:mh*r})[0];
        newcanvas.getContext('2d').drawImage(this.project.viewer.drawer.canvas,mx*r,my*r,mw*r,mh*r,0,0,mw*r,mh*r);
        let dataurl = newcanvas.toDataURL();
        let raster = new paper.Raster({source:dataurl,position:poly.bounds.center});
        raster.scale(1/(r*this.project.getZoom()));
        poly && poly.makeRaster(raster);
    }
    
}
class RasterToolbar extends ToolbarBase{
    constructor(tool){
        super(tool);
        this.button.configure('Raster','Raster Tool');
        let d = $('<div>').appendTo(this.dropdown);
        let button = $('<button>').text('Convert to raster').appendTo(d);
        let span = $('<span>').text('Warning: this cannot be undone!').appendTo(d);

        button.on('click',()=>tool.rasterize())
    }
    isActiveForMode(mode){
        return ['Polygon'].includes(mode);
    }
}