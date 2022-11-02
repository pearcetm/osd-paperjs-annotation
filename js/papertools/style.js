import {AnnotationUITool, AnnotationUIToolbarBase} from './annotationUITool.js';
export class StyleTool extends AnnotationUITool{
    constructor(paperScope){
        super(paperScope);
        let self =  this;
        let tool = this.tool;
        this._ignoreNextSelectionChange=false;
        this._targetItems = [];
        
        this.setToolbarControl(new StyleToolbar(this));

        let cursorGridSize=9;//this must be an odd number so the grid is symmetric around a center cell
        let cursorCellSize=12;
        this.cursor = ColorpickerCursor(cursorCellSize,cursorGridSize,this.project.toolLayer);
        this.cursor.applyRescale();

        this.extensions.onActivate = function(){ console.log('style tool onActivate')
            if(self.pickingColor){
                self.project.overlay.addClass('tool-action').setAttribute('data-tool-action','colorpicker');
                self.cursor.visible=true;
            }
            self.selectionChanged();//set initial list of selected items
            // self.tool.captureUserInput(!!self.pickingColor);
            self.captureUserInput(!!self.pickingColor);
        };
        this.extensions.onDeactivate = function(finished){  console.log('style tool onDeactivate')
            self.project.overlay.removeClass('tool-action').setAttribute('data-tool-action','');
            self.cursor.visible=false;
            if(finished){
                self.cancelColorpicker();
            }
        };

        tool.extensions.onKeyUp=function(ev){
            if(ev.key=='escape'){
                // console.log('escape key detected')
                self.cancelColorpicker();
            }
        }
        tool.onMouseMove=function(ev){            
            if(self.pickingColor){
                self.cursor.position=ev.point;

                // //desired rotation is negative of view rotation value
                // let delta = -1*self.cursor.view.rotation - self.cursor.rotation;//relies on applyMatrix=false on cursor group ojbect
                // if(Math.abs(delta)>0.01) self.cursor.rotate(delta);

                let o = self.project.overlay.osdViewer.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(ev.point.x,ev.point.y));
                let x = Math.round(o.x)-Math.floor(self.cursor.numColumns/2);
                let y = Math.round(o.y)-Math.floor(self.cursor.numRows/2);
                let w = self.cursor.numColumns;
                let h = self.cursor.numRows;
                let r = self.project.paperScope.view.pixelRatio            
                let imdata = self.project.overlay.osdViewer.drawer.canvas.getContext('2d').getImageData(x*r,y*r,w*r,h*r);
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
                        self.cursor.children[p].fillColor.red = getval(i);
                        self.cursor.children[p].fillColor.green = getval(i+1);
                        self.cursor.children[p].fillColor.blue = getval(i+2);
                    }
                }
                self.cursor.borderElement.fillColor = self.cursor.centerCell.fillColor;
                self.cursor.selectedColor = self.cursor.centerCell.fillColor;                
            }
        }
        tool.onMouseUp=function(ev){
            if(self.pickingColor && self.cursor.visible){
                //broadcast('color-picked',{color:cursor.selectedColor});
                self._colorpickerPromise && self._colorpickerPromise.resolve(self.cursor.selectedColor);
                self._colorpickerPromise = null;
                self.cancelColorpicker();
            }
        }
    }
    activateForItem(item){
        this.targetItems = item;
        this._ignoreNextSelectionChange=true;
        this.activate();
        this.toolbarControl.updateDisplay();
        this._ignoreNextSelectionChange=false;
        console.log('finished activateForItem')
    }
    onSelectionChanged(){
        if(!this._ignoreNextSelectionChange){
            console.log('onSelctionChanged handled')
            this.targetItems = this.items;
            this.toolbarControl.updateDisplay();
        }
        else{
            console.log('onSelctionChanged ignored')
        }
        this._ignoreNextSelectionChange=false;
    }
    get defaultTarget(){
        return this.project.paperScope.project;
    }
    get targetItems(){
        // return this._targetItems.map(item=>item.defaultStyle || item)
        return this._targetItems;
    }
    set targetItems(target){
        this._targetItems= target ? [target].flat().filter(t=>t.defaultStyle||t.style) : [];
        if(this._targetItems.length==0) this._targetItems=[this.defaultTarget];
    }
    get targetItemStyles(){
        return this._targetItems.map(item=>item.defaultStyle || item.style);
    }
    get targetDescription(){
        if(this._targetItems.length==0){
            return "No target";
        }
        else if(this._targetItems.length>1){
            return `${this._targetItems.length} items`;
        }
        else{
            let t = this._targetItems[0];
            return t==this.defaultTarget ? 'Default style' : t.displayName;
        }
    }
    
    pickColor(){
        let self=this;
        self.captureUserInput(true);
        return new Promise(function(resolve,reject){
            self._colorpickerPromise && self._colorpickerPromise.reject('Canceled');
            self._colorpickerPromise = {resolve:resolve, reject:reject};
            self.activate();
            self.pickingColor=true;
            self.cursor.visible=true;
            self.cursor.addTo(self.project.paperScope.project.activeLayer);
            self.tool.onMouseMove({point:self.cursor.view.center});
            self.project.overlay.addClass('tool-action').setAttribute('data-tool-action','colorpicker');
        }).finally(()=>{
            self.captureUserInput(false);
        })

    }
    
    cancelColorpicker(){
        // console.log('canceling colorpicker')
        this.cursor.addTo(this.project.toolLayer);
        this.pickingColor=false;
        this.cursor.visible = false;            
        this.project.overlay.removeClass('tool-action').setAttribute('data-tool-action','');
        
        this._colorpickerPromise && this._colorpickerPromise.reject('Canceled');
    }
    createMaskedImage(item){
        let mask = item.clone();
        let grp = new paper.Group([mask]);
        // console.log('itemToAverage',itemToAverage);
        let imgrect=this.project.overlay.osdViewer.viewport.viewportToViewerElementRectangle(this.project.overlay.osdViewer.world.getItemAt(0).getBounds());
        let viewrect=this.project.overlay.osdViewer.viewport.viewportToViewerElementRectangle(this.project.overlay.osdViewer.viewport.getBounds());
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
        let r = this.project.paperScope.view.pixelRatio;
        let newcanvas = $('<canvas>').attr({width:mw*r,height:mh*r})[0];
        newcanvas.getContext('2d').drawImage(this.project.overlay.osdViewer.drawer.canvas,mx*r,my*r,mw*r,mh*r,0,0,mw*r,mh*r);
        let dataurl = newcanvas.toDataURL();
        let raster = new paper.Raster({source:dataurl,position:mask.bounds.center});
        raster.scale(1/(r*this.project.getZoom()));
        grp.addChild(raster);
        grp.clipped=true;
        grp.position.x = grp.position.x+500;
        return grp;   
    }
    applyStrokeWidth(value){
        // console.log('applyStrokeWidth',this.targetItems,value);
        this.targetItems.forEach(item=>{
            if(item.defaultStyle) item=item.defaultStyle;

            item.strokeWidth = value;
            item.rescale && (item.rescale.strokeWidth = value);

            //for annotation items, update the config object and apply rescale
            if(item.isAnnotationFeature){
                // item.config.properties.strokeWidth = value;
                // item.config.properties.rescale && (item.config.properties.rescale.strokeWidth = value);
                item.applyRescale();
            }
            
        })
    }
    applyOpacity(opacity,property){
        this.targetItems.forEach(item=>{
            let style = item.defaultStyle || item.style;
            style[property]=opacity;
            if(item.isAnnotationFeature){
                item.updateFillOpacity();
            }
        });
    }
    applyColor(value,type,item){
        if(type=='fill') this.applyFillColor(value,item);
        else if(type=='stroke') this.applyStrokeColor(value,item);
        else console.warn(`Cannot apply color change - type "${type}" not recognized`)
    }
    applyFillColor(value,item){
        (item?[item]:this.targetItems).forEach(item=>{
            let color = new paper.Color(value);
            let style = item.defaultStyle || item.style;
            style.fillColor = color;
            
            if(item.isAnnotationFeature){
                item.updateFillOpacity();
            }
        })
        
    }
    applyStrokeColor(value,item){
        (item?[item]:this.targetItems).forEach(item=>{
            let color = new paper.Color(value);
            let style = item.defaultStyle || item.style;
            // style.strokeColor && (color.alpha = style.strokeColor.alpha);
            style.strokeColor = color;
            if(item.isAnnotationFeature){
                // item.config.properties.strokeColor = item.strokeColor;
                item.updateStrokeOpacity();
            }
        })
        
    }

}

export class StyleToolbar extends AnnotationUIToolbarBase{
    constructor(tool){
        super(tool);
        let self=this;
        let html = $('<i>',{class:'fa-solid fa-palette'})[0];
        this.button.configure(html,'Style Tool');
        $(this.dropdown).append(this.uiHTML());
        this._hierarchy = [];

        $(this.dropdown).find('[data-action="pick-color"]').on('click',function(){
            let type = $(this).data('type');
            let colorinput = $(self.dropdown).find(`input[type="color"][data-type="${type}"]`);
            $(self.dropdown).find('[data-action="pick-color"]').removeClass('active');
            if(colorinput.is(':visible')){
                $(self.dropdown).find('.colorpicker-row').addClass('hidden');
            }
            else{
                $(self.dropdown).find('.colorpicker-row').addClass('hidden');
                colorinput.closest('.colorpicker-row').removeClass('hidden');
                $(this).addClass('active');
            }
        })

        $(this.dropdown).find('input[type="color"]').on('input',function(){
            let type = $(this).data('type');
            self.tool.applyColor(this.value,type);
            type=='fill' && self.setFillButtonColor(new paper.Color(this.value))
            type=='stroke' && self.setStrokeButtonColor(new paper.Color(this.value))
        });
        $(this.dropdown).find('input[type="number"]').on('input',function(){
            console.log('number input',this.value)
            self.tool.applyStrokeWidth(this.value);
        })
        $(this.dropdown).find('input[data-action="opacity"]').on('input',function(){
            let type = $(this).data('type');
            let prop = $(this).data('property');
            self.tool.applyOpacity(this.value,prop);
            type=='fill' && self.setFillButtonOpacity(this.value);
            type=='stroke' && self.setStrokeButtonOpacity(this.value);
        })
        $(this.dropdown).find('[data-action="from-image"]').on('click',function(){
            self.tool.pickColor().then((color)=>{
                $(this).siblings('input[type="color"]').val(color.toCSS(true)).trigger('input');
            }).catch(error=>{});
        });
        $(this.dropdown).find('[data-action="from-average"]').on('click',function(){
            let type = $(this).data('type');
            self.fromAverage(type);
        });
        $(this.dropdown).find('.style-item').on('click',function(){
            let items = self.tool.targetItems;
            console.log('Style item clicked',items)
            let allSelected = items.every(item=>item.selected);
            // let selectableItems = items.filter(item=>item.select);
            let selectableItems = items.filter(item=>item.isAnnotationFeature);
            if(selectableItems.length > 0){
                self.tool._ignoreNextSelectionChange = true;
                selectableItems.forEach(item=>allSelected ? item.deselect() : item.select());//select all if not all selected, else unselect all
            }
            self.updateTargetDescription();
        })
        $(this.dropdown).find('.hierarchy-up').on('click',function(){
            if(self._hierarchy && self._hierarchy.length>0){
                self._hierarchy.index = (self._hierarchy.index+1) % self._hierarchy.length;
            }
            else{
                let items = self.tool.targetItems;
                let layers = new Set(items.map(item=>item.hierarchy.filter(i=>i.isAnnotationLayer && i!==item)).flat());
                if(layers.size==0){
                    //this happens if a layer was directly selected, or if the default target was directly selected
                    if(items.indexOf(self.tool.defaultTarget)>-1){
                        self._hierarchy=[self.tool.defaultTarget];
                        self._hierarchy.index=0;
                    }
                    else{
                        self._hierarchy=[items, self.tool.defaultTarget];
                        self._hierarchy.index=1;
                    }
                }
                else if(layers.size==1){
                    //this happens if children of exactly one annotation layer are the target
                    self._hierarchy = [self.tool.targetItems, layers.values().next().value, self.tool.defaultTarget];
                    self._hierarchy.index = 1;
                }
                else{
                    //this happens if children of more than one layer are selected
                    self._hierarchy = [self.tool.targetItems, self.tool.defaultTarget];
                    self._hierarchy.index = 1;
                }

            }
            let hierarchyRef = self._hierarchy;
            self.tool.activateForItem(self._hierarchy[self._hierarchy.index]);
            self._hierarchy = hierarchyRef;//on activation this variable is cleared; reset here
            // console.log('Hierarchy up',items)
        })
    }
    
    fromAverage(type){
        console.log('fromAverage called')
        let self=this;
        let promises = this.tool.targetItems.map(item=>{
            return getAverageColor(item).then( (color)=> {
                // console.log('color calculated',color,item)
                self.tool.applyColor(color,type,item);
            }) 
        });
        Promise.all(promises).then(()=>self.updateDisplay());
    }
    isEnabledForMode(mode){
        return true;
    }
    uiHTML(){
        let html=`
            <div class="style-toolbar">
                <div class="flex-row style-row annotation-ui-buttonbar" >
                    <span><span class="hierarchy-up fa-solid fa-sitemap" title='Cycle through hierarchy'></span><span class='style-item' title='Toggle selection'></span></span>
                    <span class='btn' data-action="pick-color" data-type="fill"><span class="preview"><span class="color bg"></span><span class="color text">Fill</span></span></span>
                    <span class='btn' data-action="pick-color" data-type="stroke"><span class="preview"><span class="color bg"></span><span class="color text">Stroke</span></span></span>
                    <input type="number" min=0 value=1>
                </div>
                <div class="colorpicker-row hidden">
                    <input type="color" data-action="color" data-type="fill">
                    <input type="range" data-action="opacity" data-type="fill" data-property="fillOpacity" min=0 max=1 step=0.01 value=1>
                    <span class='btn' data-action="from-image">From image</span>
                    <span class='btn' data-action="from-average" data-type="fill">Area average</span>
                </div>
                <div class="colorpicker-row hidden">
                    <input type="color" data-action="color" data-type="stroke">
                    <input type="range" data-action="opacity" data-type="stroke" data-property="strokeOpacity" min=0 max=1 step=0.01 value=1>
                    <span class='btn' data-action="from-image">From image</span>
                    <span class='btn' data-action="from-average" data-type="stroke">Area average</span>
                </div>
            </div>
        `;
        return html;
    }
    updateTargetDescription(){
        let targetDescription = this.tool.targetDescription;
        let allSelected = this.tool.targetItems.every(item=>item.selected && item.isAnnotationFeature);
        let element = $(this.dropdown).find('.style-item').text(targetDescription);
        allSelected ? element.addClass('selected') : element.removeClass('selected');
    }
    updateDisplay(){
        this._hierarchy = [];
        let targets = this.tool.targetItemStyles;
        console.log('Style toolbar update display',targets)
        this.updateTargetDescription();

        let fillColor = targets.map(item=>item.fillColor);
        if(fillColor.length==1 || new Set(fillColor.map(c=>c.toCSS())).size == 1){
            this.setFillButtonColor(fillColor[0])
        }
        else{
            // console.warn('Multiple colors not implemented')
            this.setFillButtonColor();
        }
        
        let strokeColor = targets.map(item=>item.strokeColor);
        if(strokeColor.length==1 || new Set(strokeColor.map(c=>c.toCSS())).size == 1){
            this.setStrokeButtonColor(strokeColor[0])
        }
        else{
            // console.warn('Multiple colors not implemented')
            this.setStrokeButtonColor();
        }

        let fillOpacity = targets.map(item=>item.fillOpacity);
        if(fillOpacity.length==1 || new Set(fillOpacity).size==1){
            this.setFillButtonOpacity(fillOpacity[0])
        }
        else{
            // console.warn('Multiple opacities not implemented; setting to 1');
            this.setFillButtonOpacity(1);
        }
        let strokeOpacity = targets.map(item=>item.strokeOpacity);
        if(strokeOpacity.length==1 || new Set(strokeOpacity).size==1){
            this.setStrokeButtonOpacity(strokeOpacity[0])
        }
        else{
            // console.warn('Multiple opacities not implemented; setting to 1');
            this.setStrokeButtonOpacity(1);
        }
        let strokeWidth = targets.map(item=>item.rescale ? item.rescale.strokeWidth : item.strokeWidth);
        if(strokeWidth.length==1 || new Set(strokeWidth).size==1){
            $(this.dropdown).find('input[type="number"]').val(strokeWidth[0]);
        }
        else{
            // console.warn('Multiple stroke widths not implemented; clearing input')
            $(this.dropdown).find('input[type="number"]').val('');
        }
    }
    setFillButtonColor(color = new paper.Color('white')){
        // let val = color ? color.toCSS(true) : 'none';
        // let textcolor = color ? getContrastYIQ(color.toCSS(true)) : 'black';
        if(!color) color = new paper.Color('white');
        let val = color.toCSS(true);
        let textcolor = getContrastYIQ(color.toCSS(true));
        $(this.dropdown).find('[data-type="fill"] .preview .text').css({color:textcolor});
        $(this.dropdown).find('[data-type="fill"] .preview .color').css({'background-color':val,'outline-color':textcolor});
        $(this.dropdown).find('input[type="color"][data-type="fill"]').val(val);
    }
    setStrokeButtonColor(color = new paper.Color('black')){
        // let val = color ? color.toCSS(true) : 'none';
        // let textcolor = color ? getContrastYIQ(color.toCSS(true)) : 'black';
        if(!color) color = new paper.Color('black');
        let val = color.toCSS(true);
        let textcolor = getContrastYIQ(color.toCSS(true));
        $(this.dropdown).find('[data-type="stroke"] .preview .text').css({color:textcolor});
        $(this.dropdown).find('[data-type="stroke"] .preview .color').css({'background-color':val,'outline-color':textcolor});
        $(this.dropdown).find('input[type="color"][data-type="stroke"]').val(val);
    }
    setFillButtonOpacity(val){
        $(this.dropdown).find('[data-type="fill"] .preview .bg').css({'opacity':val});
        $(this.dropdown).find('[data-type="fill"][data-action="opacity"]').val(val);
    }
    setStrokeButtonOpacity(val){
        $(this.dropdown).find('[data-type="stroke"] .preview .bg').css({'opacity':val});
        $(this.dropdown).find('[data-type="stroke"][data-action="opacity"]').val(val);
    }
}

export function ColorpickerCursor(cursorCellSize,cursorGridSize,parent){
    let cursor = new paper.Group({visible:false, applyMatrix:false});
    parent.addChild(cursor);
    //desired rotation is negative of view rotation value
    cursor.view.on('rotate',ev=>cursor.rotate(-ev.rotatedBy));
    
    cursor.numRows=cursorGridSize;
    cursor.numColumns=cursorGridSize;
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
    cursor.applyRescale = function(){cursor.children.forEach(child=>child.applyRescale());}
    return cursor;
}

export async function getAverageColor(itemToAverage){
    
    let raster = ((itemToAverage.project && itemToAverage.project.overlay) || itemToAverage.overlay).osdViewer.getViewportRaster(itemToAverage.view);
    return new Promise(function(resolve,reject){
        raster.onLoad = function(){
            let color = raster.getAverageColor(itemToAverage);
            raster.remove();
            if(!color){
                reject('Error: The item must be visible on the screen to pick the average color of visible pixels. Please navigate and retry.')
            } 
            console.log('in getViewportRaster().onLoad; color=',color);
            resolve(color);
        }
    });
    
};

//local functions

// Calculate best text color for contrast from background - https://stackoverflow.com/a/11868398
function getContrastYIQ(hexcolor){
    hexcolor = hexcolor.replace("#", "");
    var r = parseInt(hexcolor.substr(0,2),16);
    var g = parseInt(hexcolor.substr(2,2),16);
    var b = parseInt(hexcolor.substr(4,2),16);
    var yiq = ((r*299)+(g*587)+(b*114))/1000;
    return (yiq >= 140) ? 'black' : 'white';
}