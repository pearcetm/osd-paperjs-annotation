import {AnnotationUITool, AnnotationUIToolbarBase} from './annotationUITool.js';
import {ColorpickerCursor,getAverageColor} from './style.js';
import {Morph} from '../utils/morph.js';
import { makeMagicWand } from '../utils/magicwand.js';
// import { OpenCV } from '../utils/opencv.js';

export class WandTool extends AnnotationUITool{
    constructor(paperScope){
        super(paperScope);
        let self = this;
        let tool = this.tool;   
        this.paperScope = self.project.paperScope;
        
        this.reduceMode = false;
        this.replaceMode = true;
        this.floodMode = true;

        // this.cv = new OpenCV();
        
        this.colors = {
            pixelAllowed: new paper.Color({red:0,green:0,blue:100}),
            pixelNotAllowed: new paper.Color({red:100,green:0,blue:0}),
            currentItem : new paper.Color({red:0,green:100,blue:0,alpha:0.5}),
            nullColor: new paper.Color({red:0,green:0,blue:0,alpha:0}),//transparent pixels if negative
            defaultColor: new paper.Color({red:255,green:255,blue:255}),
        }
        
        this.threshold=10;
        this.minThreshold=-1;
        this.maxThreshold=100;
        this.startThreshold=10;

        //colorpicker
        let colorPicker = ColorpickerCursor(10,7,self.project.toolLayer);
        colorPicker.applyRescale();


        this.MagicWand = makeMagicWand();

        this.setToolbarControl(new WandToolbar(this));
        this.toolbarControl.setThreshold(this.threshold);

        let callback=function(){
            self.getImageData();
        }
        this.onSelectionChanged = callback; 
        this.extensions.onActivate = function(){ 
            let item = (self.item || self.itemToCreate);
            self.itemLayer = item ? item.layer : null;

            self.getImageData();
            self.project.overlay.osdViewer.addHandler('animation-finish',callback);
            self.project.overlay.osdViewer.addHandler('rotate',callback);  
            colorPicker.visible=true;
            self.project.toolLayer.bringToFront();
        };
        this.extensions.onDeactivate = function(finished){
            self.project.overlay.osdViewer.removeHandler('animation-finish',callback);
            self.project.overlay.osdViewer.removeHandler('rotate',callback);
            colorPicker.visible=false;
            this.preview && this.preview.remove();
            if(finished){
                self.finish();
            }
            self.project.toolLayer.sendToBack();
        };
        
        tool.onMouseDown=function(ev){
            self.startThreshold=self.threshold;
            self.imageData.dragStartMask = self.imageData.binaryMask;
            self.applyMagicWand(ev.point);
            colorPicker.visible=false;     
        }
        tool.onMouseDrag=function(ev){
            let delta = ev.point.subtract(ev.downPoint).multiply(self.project.getZoom());
            if(self.reduceMode) delta = delta.multiply(-1); //invert effect of dragging when in reduce mode for more intuitive user experience
            let s=Math.round((delta.x+delta.y*-1)/2);
            self.threshold=Math.min(Math.max(self.startThreshold+s, self.minThreshold), self.maxThreshold);
            if(Number.isNaN(self.threshold)){
                // console.log('wft nan??');
                console.warn('NaN value for threshold')
            }
            self.toolbarControl.setThreshold(self.threshold);
            self.applyMagicWand(ev.downPoint);
        }
        tool.onMouseMove=function(ev){
            
            colorPicker.position=ev.point;
            let o = self.project.overlay.osdViewer.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(ev.point.x,ev.point.y));
            let x = Math.round(o.x)-Math.floor(colorPicker.numColumns/2);
            let y = Math.round(o.y)-Math.floor(colorPicker.numRows/2);
            let w = colorPicker.numColumns;
            let h = colorPicker.numRows;
            let r = self.paperScope.view.pixelRatio            
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
                    colorPicker.children[p].fillColor.red = getval(i);
                    colorPicker.children[p].fillColor.green = getval(i+1);
                    colorPicker.children[p].fillColor.blue = getval(i+2);
                }
            }
            colorPicker.borderElement.fillColor = colorPicker.centerCell.fillColor;
            colorPicker.selectedColor = colorPicker.centerCell.fillColor;  
        }
        tool.onMouseUp=function(ev){
            colorPicker.visible=true;
            colorPicker.bringToFront();
            colorPicker.position=ev.point;
            
        }
        
        tool.extensions.onKeyUp=function(ev){
            // console.log(`Key up on ${ev.key} key`)
            if(ev.key=='a'){
                self.applyChanges();
            }
            if(ev.key=='e'){
                self.reduceMode = !self.reduceMode;
                self.toolbarControl.setReduceMode(self.reduceMode);
            }
            if(ev.key=='r'){
                self.replaceMode = !self.replaceMode;
                self.toolbarControl.setReplaceMode(self.replaceMode);
            }
            if(ev.key=='f'){
                self.floodMode = !self.floodMode;
                self.toolbarControl.setFloodMode(self.floodMode);
            }
        }
    }
    finish(){
        // if(item) smoothAndSimplify(item);
        this.itemLayer=null;
        this.preview && this.preview.remove();
        this.deactivate();    
    }
    setThreshold(t){
        this.threshold=parseInt(t);
    }
    setReduceMode(erase){
        this.reduceMode=erase;
    }
    setFloodMode(flood){
        this.floodMode=flood;
    }
    setReplaceMode(replace){
        this.replaceMode=replace;
    }
    
    applyChanges(){
        if(this.itemToCreate){
            this.project.paperScope.initializeItem('Polygon');
            this.getSelectedItems();
        }
        let wandOutput = {
            width:this.imageData.width,
            height:this.imageData.height,
            data:this.imageData.binaryMask,
            bounds:{
                minX:0,
                minY:0,
                maxX:this.preview.width,
                maxY:this.preview.height,
            }
        };
        
        
        let viewRect = new paper.Path.Rectangle(new paper.Point(0.1,0.1), new paper.Point(this.preview.width-0.1,this.preview.height-0.1), {insert:false})
        let toUnite = maskToPath(this.MagicWand, wandOutput,);
        let dilated = maskToPath(this.MagicWand, wandOutput,'dilate');
        let toErase = viewRect.subtract(dilated,{insert:false});
        
        [viewRect, toUnite, toErase].forEach(item=>{
            item.translate(-this.preview.width/2, -this.preview.height/2);
            item.matrix = this.preview.matrix;
        });

        let n1 = this.item.subtract(toErase,{insert:false});
        n1 = n1.toCompoundPath();
        // removeDuplicates(n1);
        
        let newPath = n1.unite(toUnite,{insert:false});
        
        newPath = newPath.toCompoundPath();
        
        toUnite.remove();
        toErase.remove();
        dilated.remove();
        n1.remove();
        newPath.remove();//if wand tool stops working move this back after the swapping of children
        viewRect.remove();

        let success =  newPath !== n1;
        if(success){
            // console.log('Wand tool setting item children')
            this.item.removeChildren();
            this.item.addChildren(newPath.children);
        }
        
        
        this.getImageData();
        
    };
    
    async getImageData(){
        let self=this;
        let viewer = self.project.overlay.osdViewer;
        let imageData = viewer.getImageData();
        
        let viewportGroup = new paper.Group({children:[],insert:false});

        let b = self.tool.view.bounds
        let viewportPath = new paper.Path(b.topLeft, b.topRight, b.bottomRight, b.bottomLeft);
        viewportPath.strokeWidth=0;
        viewportGroup.addChild(viewportPath.clone());
        viewportGroup.addChild(viewportPath);
        viewportGroup.clipped=true;
        
        let boundingItems = this.itemLayer ? this.itemLayer.getItems({match:i=>i.isBoundingElement}) : [];
        //allow all pixels if no bounding item, otherwise disallow all and then allow those inside the bounding item(s);
        viewportPath.fillColor = boundingItems.length==0 ? self.colors.pixelAllowed : self.colors.pixelNotAllowed;
        boundingItems.forEach(item=>{
            let clone = item.clone({insert:false});
            clone.fillColor = self.colors.pixelAllowed;
            clone.strokeWidth=0;
            viewportGroup.addChild(clone);
        })
        if(self.item){
            let clone = self.item.clone({insert:false});
            clone.fillColor = self.colors.currentItem;
            clone.strokeWidth = 0;
            clone.selected=false;
            viewportGroup.addChild(clone);
        }
        
        viewportGroup.selected=false;

        //hide all annotation layers; add the viewportGroup; render; get image data; remove viewportGroup; restore visibility of layers
        let annotationLayers = self.project.paperScope.project.layers.filter(l=>l.isAnnotationLayer);
        let visibility = annotationLayers.map(l=>l.visible);
        annotationLayers.forEach(l=>l.visible=false);
        self.project.toolLayer.addChild(viewportGroup);
        self.tool.view.update();
        let cm = self.tool.view.getImageData();
        viewportGroup.remove();
        annotationLayers.forEach((l,index)=>l.visible = visibility[index]);
        self.tool.view.update();
        
        self.imageData = {
            width:imageData.width,
            height:imageData.height,
            data:imageData.data,
            bytes:4,
            colorMask:cm,
        }
        self.imageData.binaryMask = new Uint8ClampedArray(self.imageData.width * self.imageData.height);
        for(let i = 0, m=0; i<self.imageData.data.length; i+= self.imageData.bytes, m+=1){
            self.imageData.binaryMask[m]=self.imageData.colorMask.data[i+1] ? 1 : 0;//green channel is for current item
        }
        
        if(self.item && self.item.isAnnotationFeature && self.item.getArea()){
            getAverageColor(self.item).then(sampleColor=>{
                let c = [sampleColor.red*255,sampleColor.green*255,sampleColor.blue*255];
                self.imageData.sampleColor = c;
                self.rasterPreview(self.imageData.binaryMask, c);
            });
        }
        else{
            self.rasterPreview(self.imageData.binaryMask);
        } 
        // imgPreview(this.getImageDataURL(cm));
        
    }
    applyMagicWand(eventPoint){
        let pt = this.paperScope.view.projectToView(eventPoint);
        //account for pixel density
        let r = this.paperScope.view.pixelRatio
        pt = pt.multiply(r);

        //use floodFill or thresholdMask depending on current selected option
        let magicWandOutput;
        if(this.floodMode){
            magicWandOutput = this.MagicWand.floodFill(this.imageData,Math.round(pt.x),Math.round(pt.y),this.threshold);
        }
        else{
            magicWandOutput = this.MagicWand.thresholdMask(this.imageData, Math.round(pt.x), Math.round(pt.y), this.threshold);
        }
        
        let bm = this.imageData.binaryMask;
        let ds = this.imageData.dragStartMask;
        let cm = this.imageData.colorMask.data;
        let mw = magicWandOutput.data;

        //apply rules based on existing mask
        //1) set any pixels outside the bounding area to zero
        //2) if expanding current area, set pixels of existing item to 1
        //3) if reducing current area, use currentMask to remove pixels from existing item
        if(this.replaceMode && !this.reduceMode){ //start from the initial item (cm[i+1]>0) and add pixels from magicWandOutput (mw[m]) if allowed (cm[i]==0)
            for(let i = 0, m=0; i<cm.length; i+= this.imageData.bytes, m+=1){
                bm[m] = cm[i+1]>0 || (cm[i]==0 && mw[m]);
            }
        }
        else if(this.replaceMode && this.reduceMode){ //start from initial item (cm[i+1]>0) and remove pixels from mw[m] if allowed (cm[i]==0)
            for(let i = 0, m=0; i<cm.length; i+= this.imageData.bytes, m+=1){
                bm[m] = cm[i+1]>0 && !(cm[i]==0 && mw[m]);
            }
        }
        else if(!this.replaceMode && !this.reduceMode){ //start from dragstart (ds[m]) and add pixels from mw[m] if allowed (cm[i]==0)
            for(let i = 0, m=0; i<cm.length; i+= this.imageData.bytes, m+=1){
                bm[m] = ds[m] || (cm[i]==0 && mw[m]);
            }
        }
        else if(!this.replaceMode && this.reduceMode){ //start from dragstart (ds[m]) and remove pixels from mw[m] if allowed (cm[i]==0)
            for(let i = 0, m=0; i<cm.length; i+= this.imageData.bytes, m+=1){
                bm[m] = ds[m] && !(cm[i]==0 && mw[m]);
            }
        }

        // imgPreview(this.getDataURL(this.imageData.binaryMask));
        this.rasterPreview(this.imageData.binaryMask,this.imageData.sampleColor || magicWandOutput.sampleColor);
        
    }
    rasterPreview(binaryMask, sampleColor){
        let self=this;
        let cmap = {0: this.colors.nullColor, 1: this.colors.defaultColor};
        //If a sample color is known, "invert" it for better contrast relative to background image
        if(sampleColor){
            cmap[1] = new paper.Color(sampleColor[0],sampleColor[1],sampleColor[2]);
            cmap[1].hue+=180;
            cmap[1].brightness=(180+cmap[1].brightness)%360;
        }

        this.preview && this.preview.remove();
        this.preview = this.project.paperScope.overlay.osdViewer.getViewportRaster(this.project.paperScope.view, false);
        this.project.toolLayer.insertChild(0, this.preview);//add the raster to the bottom of the tool layer
        
        let c;
        let imdata=this.preview.createImageData(this.preview.size);
        for(var ix=0, mx=0; ix<imdata.data.length; ix+=4, mx+=1){
            c = cmap[binaryMask[mx]];
            imdata.data[ix]=c.red;
            imdata.data[ix+1]=c.blue;
            imdata.data[ix+2]=c.green;
            imdata.data[ix+3]=c.alpha*255;
        }
        this.preview.setImageData(imdata, new paper.Point(0,0));
        
        function tween1(){self.preview.tweenTo({opacity:0.15},{duration:1200,easing:'easeInQuart'}).then(tween2);}
        function tween2(){self.preview.tweenTo({opacity:1},{duration:800,easing:'easeOutCubic'}).then(tween1);}
        tween1();
    } 
    
    
}

class WandToolbar extends AnnotationUIToolbarBase{
    constructor(wandTool){
        super(wandTool);
        let html = $('<i>',{class:"fa-solid fa-wand-magic-sparkles fa-rotate-270"})[0];
        this.button.configure(html,'Magic Wand Tool');
        
        let fdd = $('<div>',{'data-tool':'wand',class:'dropdown wand-toolbar'}).appendTo(this.dropdown);
        let thr = $('<div>',{class:'threshold-container'}).appendTo(fdd);
        $('<label>').text('Threshold').appendTo(thr)
        this.thresholdInput=$('<input>',{type:'range',min:-1,max:100,value:20}).appendTo(thr).on('change',function(){
            wandTool.setThreshold($(this).val());
        });
        
        let toggles=$('<div>',{class:'toggles'}).appendTo(fdd);
        
        $('<span>',{class:'option-toggle'}).appendTo(toggles)
            .data({
                prefix:'On click:',
                actions:[{replace:'Start new mask'}, {append:'Add to current'}],
                onclick:function(action){
                    wandTool.setReplaceMode(action=='replace');
                }
            })
        $('<span>',{class:'option-toggle'}).appendTo(toggles)
            .data({
                prefix:'Fill rule:',
                actions:[{flood:'Contiguous'}, {everywhere:'Anywhere'}],
                onclick:function(action){
                    wandTool.setFloodMode(action=='flood')
                }
            });
        $('<span>',{class:'option-toggle'}).appendTo(toggles)
            .data({
                prefix:'Use to:',
                actions:[{expand:'Expand selection'}, {reduce:'Reduce selection'}],
                onclick:function(action){
                    wandTool.setReduceMode(action=='reduce');
                }
            });
        
        toggles.find('.option-toggle').each((index,item)=>{
            // console.log('option-toggle item',item)
            item=$(item);
            let data=item.data();
            $('<span>',{class:'prefix label'}).text(data.prefix).appendTo(item);
            
            data.actions.forEach((action,actionIndex)=>{
                let text=Object.values(action)[0];
                let key = Object.keys(action)[0];
                let option = $('<span>',{class:'option'}).text(text).appendTo(item).data({key:key,index:actionIndex});
                if(actionIndex==0) option.addClass('selected');
            })
            item.on('click',function(){
                let actions=$(this).data('actions');
                let currentIndex = $(this).find('.option.selected').data('index');
                let nextIndex = typeof currentIndex==='undefined' ? 0 : (currentIndex+1) % actions.length;
                $(this).find('.option').removeClass('selected');
                let actionToEnable=$(this).find('.option').filter((idx,item)=>$(item).data('index')==nextIndex).addClass('selected').data('key');
                $(this).data('onclick')(actionToEnable);//use the 
            })
        })


        
        $('<button>',{class:'btn btn-secondary btn-sm','data-action':'apply'}).appendTo(fdd).text('Apply').on('click',function(){
            wandTool.applyChanges();
        });
        $('<button>',{class:'btn btn-sm', 'data-action':'done'}).appendTo(fdd).text('Done').on('click',function(){
            wandTool.finish();
        });
    }
    isEnabledForMode(mode){
        return ['new','Polygon','Polygon:Rectangle'].includes(mode);
    }
    
    setThreshold(thr){
        this.thresholdInput.val(thr);
    }
}


function imgPreview(dataURL){
    if(window.preview) window.preview.remove();
    window.preview = $('<img>',{style:'position:fixed;left:10px;top:10px;width:260px;',src:dataURL}).appendTo('body');
}


function maskToPath(MagicWand, mask, border){
    let minPathArea = 50;
    let path=new paper.CompoundPath({children:[],fillRule:'evenodd',insert:false});
    if(mask){
        let morph = new Morph(mask);
        mask = morph.addBorder();
        if(border=='dilate') morph.dilate();
        mask.bounds={
            minX:0,
            minY:0,
            maxX:mask.width,
            maxY:mask.height,
        }
        
        
        let contours = MagicWand.traceContours(mask);
        path.children = contours.map(function(c){
            let pts = c.points.map(pt=>new paper.Point(pt));
            let path=new paper.Path(pts,{insert:false});
            path.closed=true;
            return path;
        }).filter(function(p){
            //Use absolute area since inner (hole) paths will have negative area
            if(Math.abs(p.area) >= minPathArea){
                return true;
            }
            //if the item is being filtered out for being too small, it must be removed
            // otherwise paper.js memory usage will spike with all the extra hidden
            // path objects that will remain in the active layer (not having been inserted elsewhere)
            p.remove(); 
        })
    }
    
    return path;//.reorient(true,'clockwise');
}

// function removeDuplicates(cp){
//     let acc=cp.children.reduce(function(acc,c,i,a){
//         let remove = a.slice(i+1).some(function(o){
//             if(o.equals(c)) console.log('removing duplicate',o,c,o.area,c.area,o.equals(c))
//             return o.equals(c)
//         });
//         if(remove) acc.remove.push(i);
//         else acc.keep.push(i);
//         return acc;
//     },{keep:[],remove:[]});
//     acc.remove.reverse().forEach(function(i){cp.removeChildren(i,i+1)});
// }

