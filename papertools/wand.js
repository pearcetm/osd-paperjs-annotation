import {ToolBase, ToolbarBase} from './base.js';
export class WandTool extends ToolBase{
    constructor(project){
        super(project);
        let self = this;
        let tool = this.tool;   
        let item, start, dragging, visibleArea, viewarea, preview;
        let dragStartMask, currentMask, eraseMask, initMask;
        let reduceMode = false;
        let replaceMode = true;
        let floodMode = true;
        let drawColor = new paper.Color('green');
        let eraseColor= new paper.Color('red');
        let borderColor=new paper.Color('black');
        let nullColor=new paper.Color('black');
        drawColor.alpha=0.5;
        eraseColor.alpha=0.5;
        nullColor.alpha=0;
        let threshold=10, minThreshold=-1, maxThreshold=100, startThreshold;
        let minPathArea = 50;//in pixels
        const MagicWand = paper.MagicWand;

        this.setToolbarControl(new WandToolbar(this));
        this.toolbarControl.setThreshold(threshold);
        
        this.extensions.onActivate = function(){ 
            
            if(!item) {
                item=self.project.findSelectedPolygon(); //do not init-if-needed because we don't necessarily want to create a new polygon yet
            }
            getImageData();
            self.project.viewer.addHandler('animation-finish',getImageData);  
        };
        this.extensions.onDeactivate = function(finished){
            
            self.project.viewer.removeHandler('animation-finish',getImageData);
            
            preview && preview.remove();
            if(finished){
                self.finish();
            }
        };
        this.finish = function(){
            // if(item) smoothAndSimplify(item);
            item=dragging=null;
            preview && preview.remove();
            dragStartMask=currentMask=eraseMask=initMask=null;
            self.toolbarControl.deactivate();
            // this.broadcast('finished');      
        }
        this.setThreshold=function(t){
            threshold=parseInt(t);
        }
        this.setReduceMode=function(erase){
            reduceMode=erase;
        }
        this.setFloodMode=function(flood){
            floodMode=flood;
        }
        this.setReplaceMode=function(replace){
            replaceMode=replace;
        }
        function maskToPath(mask,border){
            let path=new paper.CompoundPath({children:[],fillRule:'evenodd'});
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
                let offset = new paper.Point(visibleArea.x-0.5,visibleArea.y-0.5);//0.5 accounts for the border being added
                let currentZoom = self.project.getZoom();
                path.children = contours.map(function(c){
                    let pts = c.points.map(function(pt){
                        return ps.view.viewToProject(new paper.Point(pt).add(offset));
                    })
                    let path=new paper.Path(pts)
                    path.closed=true;
                    return path;
                }).filter(function(p){
                    //Use absolute area since inner (hole) paths will have negative area
                    if(Math.abs(p.area*currentZoom*+currentZoom) >= minPathArea){
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
        this.applyChanges=function(){
            if(!item){
                item = this.project.initializeItem('Polygon');
                // console.log('Wand Poly init?',item);
                if(!initMask && !currentMask) getImageData();
            }

            //set bounds so that all changes get applied
            // console.log('1: ',ps.project.activeLayer.children[0].style.fillColor)
            currentMask.bounds={
                minX:0,
                minY:0,
                maxX:visibleArea.width,
                maxY:visibleArea.height,
            }
            let toUnite = maskToPath(currentMask,);
            let dilated = maskToPath(currentMask,'dilate');
            //Scale the objects to account for pixel ratio
            toUnite.scale(1/ps.view.pixelRatio, viewarea.bounds.topLeft);
            dilated.scale(1/ps.view.pixelRatio, viewarea.bounds.topLeft);

            let va = new paper.Path.Rectangle(viewarea.bounds.topLeft.add(new paper.Point(0.1,0.1)), viewarea.bounds.bottomRight.subtract(new paper.Point(0.1,0.1)))
            // let toErase = va.subtract(dilated,{insert:true});
            let toErase = fuzzyBoolOp(va,'subtract',dilated, viewarea); //<--- this needs to be tested!!! line above was working late night 10/12
            
            toUnite.set({strokeColor:'green',fillColor:'yellow'});
            toErase.set({strokeColor:'red',fillColor:'blue'});
            toUnite.fillColor.alpha=0.5;
            toErase.fillColor.alpha=0.5;
            
            let n1 = fuzzyBoolOp(item,'subtract',toErase,viewarea)
            n1 = n1.toCompoundPath();
            // console.log('n1 paths',n1.children)
            removeDuplicates(n1);
            let r = n1.set({fillColor:'magenta'}).rasterize({resolution:ps.view.resolution*self.project.getZoom(), insert:false})
            // imgPreview2.attr('src',r.toDataURL());
            
            
            let newPath = fuzzyBoolOp(n1,'unite',toUnite,viewarea);
            
            newPath = newPath.toCompoundPath();
            
            toUnite.remove();
            toErase.remove();
            dilated.remove();
            n1.remove();
            newPath.remove();//if wand tool stops working move this back after the swapping of children
            va.remove();

            // window.imgPreview = imgPreview;
            let removeDupes = false;
            if(removeDupes) removeDuplicates(newPath);

            window.fail = {
                viewarea:viewarea,
                n1:n1,
                dilated:dilated,
                toUnite:toUnite,
                toErase:toErase,
                newPath:newPath
            }
            let success =  newPath !== n1;
            if(success){
                if(!item.isBoundingElement){
                    let boundingItems = item.parent.children.filter(i=>i.isBoundingElement);
                    newPath.applyBounds(boundingItems);
                }
                item.removeChildren();
                item.addChildren(newPath.children);
            }
            
            
            getImageData();
            
        };
        
        function fuzzyBoolOp(a,op,b,viewarea){
            let success=false;
            let tries=10;
            let output;
            while(!success && tries>0){
                output=a[op](b,{insert:false});
                // console.log('here',success,tries)
                success=test(op);
                if(!success){
                    console.log(`Failed to ${op}, shifting object position`)
                    b.position = b.position.add(new paper.Point(0.01,0.01));
                    tries--;
                }
            }
            return success ? output : a;
            function test(op){
                let success=false;
                if(op=='unite'){
                    let tst = viewarea.intersect(output,{insert:false});
                    let testarea = tst.area;
                    let ref = viewarea.intersect(b,{insert:false});
                    let refarea = ref.area;
                    //console.log('testing unite',testarea,refarea)
                    success =  testarea >= refarea;
                }
                else if(op=='subtract'){
                    let tst = viewarea.intersect(output,{insert:false});
                    let testarea=tst.area;
                    let orig = viewarea.intersect(a,{insert:false});
                    let origarea = orig.area;
                    let ref = viewarea.subtract(b,{insert:false});
                    let refarea = ref.area
                    // console.log('testing subtract',testarea,origarea,refarea)
                    success =  (testarea <= origarea) && (testarea <= refarea);
                }
                return success;
            }
        }
        function removeDuplicates(cp){
            let acc=cp.children.reduce(function(acc,c,i,a){
                let remove = a.slice(i+1).some(function(o){
                    if(o.equals(c)) console.log('removing duplicate',o,c,o.area,c.area,o.equals(c))
                    return o.equals(c)
                });
                if(remove) acc.remove.push(i);
                else acc.keep.push(i);
                return acc;
            },{keep:[],remove:[]});
            // console.log(acc);
            // console.log('3: ',ps.project.activeLayer.children[0].style.fillColor)
            acc.remove.reverse().forEach(function(i){cp.removeChildren(i,i+1)});
        }
        function getImageData(){
            let imgrect=self.project.viewer.viewport.viewportToViewerElementRectangle(self.project.viewer.world.getItemAt(0).getBounds());
            let viewrect=self.project.viewer.viewport.viewportToViewerElementRectangle(self.project.viewer.viewport.getBounds());
            let x = (Math.floor(Math.max(imgrect.x, viewrect.x))-1);
            let y = (Math.floor(Math.max(imgrect.y, viewrect.y))-1);
            let w = (Math.ceil(Math.min(viewrect.x+viewrect.width, imgrect.x+imgrect.width))-x+2);
            let h = (Math.ceil(Math.min(viewrect.y+viewrect.height, imgrect.y+imgrect.height))-y+2);
            let r = ps.view.pixelRatio;
            // console.log(x,y,w,h,r);
            visibleArea={
                x:x,
                y:y,
                width:w,
                height:h,
                data:self.project.viewer.drawer.canvas.getContext('2d').getImageData(x*r,y*r,w*r,h*r),
            }
            
            viewarea && viewarea.remove();
            viewarea = new paper.Path.Rectangle(ps.view.viewToProject(new paper.Point(x,y)),ps.view.viewToProject(new paper.Point(x+w,y+h)));                
            viewarea.fillColor='black';

            // console.log('vis',visibleArea,'view',viewarea)
            
            if(item){
                let mask = new paper.Group();
                
                let clone=item.clone();
                ps.project.activeLayer.addChild(clone);
                clone.set({fillColor:'black',strokeColor:'black'});
                let background = viewarea.subtract(clone,{insert:false});
                background.fillColor='white';
                clone.name='getImageDataClone';
                clone.remove();
                //selection.fillColor='black';
                mask.addChild(viewarea);                
                mask.addChild(background);
                // let mask = viewarea.subtract(item,{insert:false});
                let raster = mask.rasterize({resolution:ps.view.resolution*self.project.getZoom(), insert:false});
                // imgPreview.attr('src',r.toDataURL());
                let id = raster.getImageData();
                // console.log(`visArea (${w}, ${h}); id (${id.width}, ${id.height})`)
                // initMask=currentMask=new ImageData(id.width, id.height);
                initMask = {
                    width:w*r,
                    height:h*r,
                    data:new Uint8ClampedArray(w*r * h*r)
                };
                currentMask = {
                    width:w*r,
                    height:h*r,
                    data:new Uint8ClampedArray(w*r * h*r)
                };
                
                let m=0;
                let idx=0;
                for(let col=0; col < w*r; col++){
                    for(let row=0; row < h*r; row++){
                        idx = 4*(col+row*id.width);
                        m=col+row*w*r;
                        initMask.data[m] = currentMask.data[m] = (id.data[idx]+id.data[idx+1]+id.data[idx+2])==0 ? 1 : 0;
                    }
                }
                // console.log('initialized current mask',currentMask.data.length,visibleArea.data.data.length/4)
                mask.remove();
                raster.remove();
                rasterPreview(currentMask,new paper.Point(x,y),true);
            }
            viewarea.visible=false;
                
        }
        function applyMagicWand(eventPoint){
            // preview && preview.remove();
            let offset = new paper.Point(visibleArea.x,visibleArea.y);
            let pt = ps.view.projectToView(eventPoint).subtract(offset);
            if(pt.x<0 || pt.y<0 || pt.x>visibleArea.width || pt.y>visibleArea.height) return;
            //account for pixel density
            let r = ps.view.pixelRatio
            pt = pt.multiply(r);
            let i = {
                width:visibleArea.width*r,
                height:visibleArea.height*r,
                data:visibleArea.data.data,
                bytes:4,
            }
            // console.log('apply magic wand i',i,pt);
            if(floodMode){
                // console.log('Flood mode on')
                if(reduceMode){
                    eraseMask = MagicWand.floodFill(i,Math.round(pt.x),Math.round(pt.y),threshold,null,false) || eraseMask;
                    currentMask = concatMasks(dragStartMask,eraseMask,true);
                    currentMask.bounds = eraseMask.bounds;
                }
                else{
                    currentMask = MagicWand.floodFill(i,Math.round(pt.x),Math.round(pt.y),threshold,null,false) || currentMask;
                    currentMask = concatMasks(currentMask,dragStartMask);
                }
            }
            else{
                // console.log('Flood mode off')
                if(reduceMode){
                    // console.log('Erase mode on')
                    eraseMask = MagicWand.thresholdMask(i, Math.round(pt.x), Math.round(pt.y), threshold) || eraseMask
                    currentMask = concatMasks(dragStartMask,eraseMask,true);
                    currentMask.bounds = eraseMask.bounds;
                }
                else{
                    // console.log('Erase mode off')                    
                    currentMask = MagicWand.thresholdMask(i,Math.round(pt.x),Math.round(pt.y),threshold) || currentMask;
                    currentMask = concatMasks(currentMask,dragStartMask);
                }
            }
            
            
            rasterPreview(currentMask, offset);
            
        }
        
        function rasterPreview(mask, offset,drawBorder){
            let rasterSize=new paper.Size(mask.width,mask.height);
            preview && preview.remove();
            preview = new paper.Raster(rasterSize);
            let pos = ps.view.viewToProject(offset).add(rasterSize.divide(2 * ps.view.pixelRatio));
            //Scale the preview and position to account for pixel ratio
            preview.scale(1/ps.view.pixelRatio);
                       
            
            self.project.toolLayer.addChild(preview);
            let id = preview.createImageData(preview.size);
            let cmap = {0: nullColor, 1:drawColor, 2: drawColor, 3:eraseColor}
            let c;
            for(var mx = 0, ix=0; mx<mask.data.length; mx+=1, ix += 4){
                c = cmap[mask.data[mx]];
                id.data[ix]   = c.red*255;   //red
                id.data[ix+1] = c.green*255; //green
                id.data[ix+2] = c.blue*255; //blue
                id.data[ix+3] = c.alpha*255; //alpha
            }
            if(drawBorder){
                let borderIndices=MagicWand.getBorderIndices(mask);
                let i,x,y,k;
                let w=mask.width;
                let h=mask.height;
                for(var bi=0;bi<borderIndices.length;bi+=1){
                    i=borderIndices[bi];
                    x=i%w;
                    y=(i-x)/w;
                    k=(y*w+x)*4;
                    id.data[k]=borderColor.red*255;
                    id.data[k+1]=borderColor.green*255;
                    id.data[k+2]=borderColor.blue*255;
                    id.data[k+3]=borderColor.alpha*255;
                }
            }
            preview.setImageData(id,new paper.Point(0,0));
            preview.position=pos;
            preview.scale(1/self.project.getZoom(),preview.bounds.topLeft);
            //imgPreview.attr('src',preview.toDataURL());
        }
            
        tool.onMouseDown=function(ev){
            dragging=true;
            start = ev.point;
            startThreshold=threshold;
            dragStartMask = (replaceMode) ? initMask : currentMask;
            applyMagicWand(start);     
        }
        tool.onMouseMove=function(ev){
            if(dragging){//if(dragging && item){
                let delta = ev.point.subtract(start).multiply(self.project.getZoom());
                let s=Math.round((delta.x+delta.y*-1)/2);
                threshold=Math.min(Math.max(startThreshold+s, minThreshold), maxThreshold);
                if(Number.isNaN(threshold)){
                    console.log('wft nan??');
                }
                // self.project.broadcast('wand-threshold',{threshold:threshold});
                self.toolbarControl.setThreshold(threshold);
                applyMagicWand(start);
            }
        }
        tool.onMouseUp=function(ev){
            dragging=false;
        }
        
        tool.extensions.onKeyUp=function(ev){
            console.log(`Key up on ${ev.key} key`)
            
            if(ev.key=='w'){
                // self.project.broadcast('wand-add',{});
            }
            if(ev.key=='e'){
                reduceMode = !reduceMode;
                self.toolbarControl.setReduceMode(reduceMode);
                // self.project.broadcast('wand-erase',{});
            }
            if(ev.key=='r'){
                replaceMode = !replaceMode;
                self.toolbarControl.setReplaceMode(replaceMode);
                // self.project.broadcast('wand-replace',{});
            }
            if(ev.key=='a'){
                // self.project.broadcast('wand-apply',{});
                self.applyChanges();
            }
            if(ev.key=='f'){
                // self.project.broadcast('wand-flood',{});
                floodMode = !floodMode;
                self.toolbarControl.setFloodMode(floodMode);
            }
        }
    } 
}

class WandToolbar extends ToolbarBase{
    constructor(wandTool){
        super(wandTool);
        this.button.configure('Wand','Magic Wand Tool');
        
        let fdd = $('<div>',{'data-tool':'wand',class:'dropdown wand-toolbar'}).appendTo(this.dropdown);
        let thr = $('<div>',{class:'threshold-container'}).appendTo(fdd);
        $('<label>').text('Threshold').appendTo(thr)
        this.thresholdInput=$('<input>',{type:'range',min:-1,max:100,value:20}).appendTo(thr).on('change',function(){
            //console.log('Range input changed',$(this).val());
            wandTool.setThreshold($(this).val());
        });
        
        let toggles=$('<div>',{class:'toggles'}).appendTo(fdd);
        this.floodInput=$('<input>',{type:'checkbox',checked:true,'data-size':"small",'data-action':'flood'}).appendTo(toggles).on('change',function(e){
            wandTool.setFloodMode($(this).prop('checked'));
            console.log('Wand flood set:',$(this).prop('checked'),e);
            e.stopImmediatePropagation();
        }).bootstrapToggle({
            on:'Flood<br>fill',
            off:'Full<br>viewport',
            width:'100%',
            height:'100%'
        });
        this.reduceInput=$('<input>',{type:'checkbox',checked:true,'data-size':"small",'data-action':'erase'}).appendTo(toggles).on('change',function(){
            wandTool.setReduceMode(!$(this).prop('checked'));
            // console.log('Wand erase set:',!$(this).prop('checked'));
        }).bootstrapToggle({
            off:'Reduce<br>area',
            on:'Expand<br>area',
            width:'100%',
            height:'100%'
        });
        this.replaceInput=$('<input>',{type:'checkbox',checked:true,'data-size':"small",'data-action':'replace'}).appendTo(toggles).on('change',function(){
            wandTool.setReplaceMode($(this).prop('checked'));
            // console.log('Wand replace set:',!$(this).prop('checked'));
        }).bootstrapToggle({
            on:'Replace<br>mask',
            off:'Keep<br>mask',
            width:'100%',
            height:'100%'
        });
        // setTimeout(()=>toggles.find('input').trigger('change'), 0);
        $('<button>',{class:'btn btn-secondary btn-sm','data-action':'apply'}).appendTo(fdd).text('Apply').on('click',function(){
            wandTool.applyChanges();
        });
        $('<button>',{class:'btn btn-sm', 'data-action':'done'}).appendTo(fdd).text('Done').on('click',function(){
            wandTool.finish();
        });
    }
    isActiveForMode(mode){
        return ['new','Polygon','Polygon:Rectangle'].includes(mode);
    }
    setFloodMode(floodmode){
        this.floodInput.prop('checked') !=floodmode && this.floodInput.prop('checked',floodmode).trigger('change');
    }
    setReduceMode(reduceMode){
        this.reduceInput.prop('checked') ==reduceMode && this.reduceInput.prop('checked',reduceMode).trigger('change');
        //the above line is inverted from the others, on purpose (== instead of !=)
    }
    setReplaceMode(replacemode){
        this.replaceInput.prop('checked') !=replacemode && this.replaceInput.prop('checked',replacemode).trigger('change');
    }
    setThreshold(thr){
        this.thresholdInput.val(thr);
    }
}


function concatMasks(a,b,erase) {
    if(!b) return a;
    if(erase && !a){
        return {
            width:b.width,
            height:b.height,
            bounds:b.bounds,
            data:new Uint8Array(b.data.length)
        };
    }
    let result = new Uint8Array(a.data.length);
    if(erase){
        for(i=0;i<a.data.length;i+=1){
            result[i]=(a.data[i]&&!b.data[i]) ? 1 : 0;
        }
    }
    else{
        for(var i=0;i<a.data.length;i+=1){
            result[i]=(a.data[i]||b.data[i]) ? 1 : 0;
        }
    }
    return {
        data: result,
        width: a.width,
        height: a.height,
        bounds: a.bounds
    };
}

class Morph {
    constructor(initmask) {
        this.width = initmask.width,
            this.height = initmask.height,
            this.data = new Uint8Array(initmask.data);
        if (this.data) {
            if (this.height * this.width != this.data.length)
                throw 'MORPH_DIMENSION_ERROR: incorrect dimensions';
        }
        else {
            // this.data = Array.apply(null, new Array(this.height * this.width)).map(Number.prototype.valueOf,0);
            this.data = Array(this.width * this.height).fill(0);
        }
        this.dilate = function () {
            // this.addBorder()
            let o = Array.from(this.data);
            let w = this.width;
            let h = this.height;
            for (var y = 0; y < h; y++) {
                for (var x = 0; x < w; x++) {
                    var ind = y * w + x;
                    this.data[ind] = o[ind] ? o[ind] : (this.adjacentIndices(ind).some(function (i) { return o[i]; }) ? 1 : 0);
                }
            }
            return {
                width: this.width,
                height: this.height,
                data: this.data
            };
        };
        this.addBorder = function () {
            this.width = this.width + 2;
            this.height = this.height + 2;
            let orig = this.data;
            this.data = new Uint8Array(this.width * this.height).fill(0);
            for (var y = 1; y < this.height - 1; y++) {
                for (var x = 1; x < this.width - 1; x++) {
                    this.data[y * this.width + x] = orig[(y - 1) * (this.width - 2) + (x - 1)];
                }
            }
            return {
                width: this.width,
                height: this.height,
                data: this.data
            };
        };
        this.adjacentIndices = function (ind) {
            var ul = ind - this.width - 1;
            var ll = ind + this.width - 1;
            let len = this.data.length;
            return [ul, ul + 1, ul + 2, ind - 1, ind + 1, ll, ll + 1, ll + 2].filter(function (i) { return i >= 0 && i < len; });
        };
    }
}