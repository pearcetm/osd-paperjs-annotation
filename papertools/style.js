import {ToolBase} from './base.js';
export class StyleTool extends ToolBase{
    constructor(project){
        super(project);
        let self =  this;
        let tool = this.tool;
        self._prevTool = null;
        let mode;
        let item;
        let cursorGridSize=9;//this must be an odd number so the grid is symmetric around a center cell
        let cursorCellSize=12;
        let cursor = makeCursor();
        self.project.toolLayer.addChild(cursor);
        

        function makeCursor(){
            let cursor = new paper.Group({visible:false});
            let s = cursorCellSize;
            let min=-((cursorGridSize-1)/2);
            let max=min+cursorGridSize;
            for(var y=min;y<max;y++){
                for(var x=min;x<max;x++){
                    let r = new paper.Shape.Rectangle({point:[x*s,y*s],size:[s,s],strokeWidth:0.5,strokeColor:'white',fillColor:'white',
                    rescale:{position:[x*s,y*s],size:[s,s],strokeWidth:0.5}});
                    cursor.addChild(r);
                    if(x==0 && y==0) cursor.centerCell = r;
                }
            }
            //add darker thicker border for central "selected" spot
            var x = 0, y = 0;
            let c = new paper.Shape.Rectangle({point:[x*s,y*s],size:[s,s],strokeWidth:1,strokeColor:'black',fillColor:null,
            rescale:{position:[x*s,y*s],size:[s,s],strokeWidth:1}});
            cursor.addChild(c);

            //add a background rectangle surrounding the whole cursor to show the selected color
            var x = 0, y = 0;
            let sz=cursorCellSize*(cursorGridSize+2);//border= 1 cell thick
            let b = new paper.Shape.Rectangle({point:[x*s,y*s],size:[sz,sz],strokeWidth:1,strokeColor:'black',fillColor:null,
            rescale:{position:[x*s,y*s],size:[sz,sz],strokeWidth:1}});
            cursor.addChild(b);
            cursor.borderElement=b;
            b.sendToBack();//this sets b as the first child, requiring 1-based indexing of grid in mousemove handler
            return cursor;
        }

        this.extensions.onActivate = function(){
            if(mode=='colorPicker') self.project.paperScope.view.addClass('tool-action').setAttribute('data-tool-action','colorpicker');
        };
        this.extensions.onDeactivate = function(finished){
            self.project.paperScope.view.removeClass('tool-action').setAttribute('data-tool-action','');
            if(finished){
                cancelColorpicker();
            }
        };

        this.getAverageColor = function(argItem){
            let itemToAverage = argItem || item;
            // console.log('itemToAverage',itemToAverage);
            let imgrect=self.project.viewer.viewport.viewportToViewerElementRectangle(self.project.viewer.world.getItemAt(0).getBounds());
            let viewrect=self.project.viewer.viewport.viewportToViewerElementRectangle(self.project.viewer.viewport.getBounds());
            let x = Math.floor(Math.max(imgrect.x, viewrect.x))-1;
            let y = Math.floor(Math.max(imgrect.y, viewrect.y))-1;
            let w = Math.ceil(Math.min(viewrect.x+viewrect.width, imgrect.x+imgrect.width))-x+2;
            let h = Math.ceil(Math.min(viewrect.y+viewrect.height, imgrect.y+imgrect.height))-y+2;
            
            //Deal with pixel ratio other than one
            let r = ps.view.pixelRatio;
            let newcanvas = $('<canvas>').attr({width:w,height:h})[0];
            newcanvas.getContext('2d').drawImage(self.project.viewer.drawer.canvas,x*r,y*r,w*r,h*r,0,0,w,h);
            let dataurl = newcanvas.toDataURL();

            return new Promise(function(resolve,reject){
                $('<img>',{style:'position:absolute;top:60px;left:10px;visibility:hidden;'}).appendTo('body').on('load',function(){
                    let raster = new paper.Raster(this);
                    let rasterSize=new paper.Size(w,h);
                    raster.position = ps.view.viewToProject(new paper.Point(x,y)).add(rasterSize.divide(2)); 
                    raster.scale(1/self.project.getZoom(),raster.bounds.topLeft)
                    // raster.selected=true;
                    let color = raster.getAverageColor(itemToAverage);
                    // broadcast('color-picked',{color:color});
                    raster.remove();
                    $(this).remove();
                    if(!color){
                        reject('Error: The item must be visible on the screen to pick the average color of visible pixels. Please navigate and retry.')
                    } 
                    resolve(color);
                }).attr('src',dataurl)
            })
            
            
        };
        this.createMaskedImage = function(item){
            let mask = item.clone();
            let grp = new paper.Group([mask]);
            // console.log('itemToAverage',itemToAverage);
            let imgrect=self.project.viewer.viewport.viewportToViewerElementRectangle(self.project.viewer.world.getItemAt(0).getBounds());
            let viewrect=self.project.viewer.viewport.viewportToViewerElementRectangle(self.project.viewer.viewport.getBounds());
            let x = Math.floor(Math.max(imgrect.x, viewrect.x))-1;
            let y = Math.floor(Math.max(imgrect.y, viewrect.y))-1;
            let w = Math.ceil(Math.min(viewrect.x+viewrect.width, imgrect.x+imgrect.width))-x+2;
            let h = Math.ceil(Math.min(viewrect.y+viewrect.height, imgrect.y+imgrect.height))-y+2;

            let mb = this.project.paperScope.view.projectToView(mask.bounds)
            let mx = mb.x;
            let my = mb.y;
            let mw = mask.bounds.width * this.project.getZoom();
            let mh = mask.bounds.height * this.project.getZoom();
            
            //Deal with pixel ratio other than one
            let r = ps.view.pixelRatio;
            let newcanvas = $('<canvas>').attr({width:mw*r,height:mh*r})[0];
            newcanvas.getContext('2d').drawImage(self.project.viewer.drawer.canvas,mx*r,my*r,mw*r,mh*r,0,0,mw*r,mh*r);
            let dataurl = newcanvas.toDataURL();
            let raster = new paper.Raster({source:dataurl,position:mask.bounds.center});
            raster.scale(1/(r*this.project.getZoom()));
            grp.addChild(raster);
            grp.clipped=true;
            grp.position.x = grp.position.x+500;
            return grp;


            // return new Promise(function(resolve,reject){
            //     $('<img>',{style:'position:absolute;top:60px;left:10px;'}).appendTo('body').on('load',function(){
            //         // let raster = new paper.Raster(this);
            //         // let rasterSize=new paper.Size(w,h);
            //         // raster.position = ps.view.viewToProject(new paper.Point(x,y)).add(rasterSize.divide(2)); 
            //         // raster.scale(1/self.project.getZoom(),raster.bounds.topLeft)
            //         // // raster.selected=true;
            //         // // let color = raster.getAverageColor(itemToAverage);
            //         // grp.insertChild(raster,0);
            //         // $(this).remove();
                    
            //         resolve(grp);
            //     }).attr('src',dataurl)
            // })
            
            
        };
        this.pickColor = function(){
            return new Promise(function(resolve,reject){
                let activeTool = self.project.getActiveTool();
                self._prevTool = (activeTool && activeTool!==self) ? activeTool : self._prevTool;
                self._colorpickerPromise && self._colorpickerPromise.reject('Canceled');
                self._colorpickerPromise = {resolve:resolve, reject:reject};
                self.activate();
                mode = 'colorPicker';
                cursor.visible=true;
                cursor.addTo(ps.project.activeLayer);
                self.project.paperScope.view.addClass('tool-action').setAttribute('data-tool-action','colorpicker');
            })

        }
        
        tool.extensions.onKeyUp=function(ev){
            if(ev.key=='esc'){
                cancelColorpicker();
            }
        }
        tool.onMouseMove=function(ev){            
            if(mode=='colorPicker'){
                cursor.position=ev.point;
                let o = self.project.viewer.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(ev.point.x,ev.point.y));
                let x = Math.round(o.x)-4;
                let y = Math.round(o.y)-4;
                let w = 9;
                let h = 9;
                let r = ps.view.pixelRatio            
                let imdata = self.project.viewer.drawer.canvas.getContext('2d').getImageData(x*r,y*r,w*r,h*r);
                //downsample if needed
                function getval(i){
                    if(r==1) return imdata.data[i]/255;
                    let values=Array.from({length:r}).map((_,col)=>{
                        return Array.from({length:r}).map((_,row)=>{
                            return imdata.data[i + (col*4) + (row*w*r*4)];
                        })
                    }).flat().filter(v=>typeof v !== 'undefined');
                    return (values.reduce((a,v)=>a+=v,0)/values.length)/255;
                }
                
                let p=1;
                for(var row=0; row<h*r; row += r){
                    for(var col=0;col<w*r; col += r, p += 1){
                        let i = 4*(col + (row*w*r));
                        cursor.children[p].fillColor.red = getval(i);
                        cursor.children[p].fillColor.green = getval(i+1);
                        cursor.children[p].fillColor.blue = getval(i+2);
                    }
                }
                cursor.borderElement.fillColor = cursor.centerCell.fillColor;
                cursor.selectedColor = cursor.centerCell.fillColor;                
            }
        }
        tool.onMouseUp=function(ev){
            if(mode=='colorPicker'){
                //broadcast('color-picked',{color:cursor.selectedColor});
                self._colorpickerPromise && self._colorpickerPromise.resolve(cursor.selectedColor);
                self._colorpickerPromise = null;
                cancelColorpicker();
            }
        }
        function cancelColorpicker(){
            cursor.addTo(self.project.toolLayer);
            mode = null;
            cursor.visible = false;            
            self.project.paperScope.view.removeClass('tool-action').setAttribute('data-tool-action','');
            if(self._prevTool){
                let pt = self._prevTool;
                self._prevTool=null;
                pt.activate();
            }
            else{
                self.deactivate();
            }
            self._colorpickerPromise && self._colorpickerPromise.reject('Canceled');
        }
    }
}