import {ToolBase, ToolbarBase} from './base.js';
import {ColorpickerCursor,getAverageColor} from './style.js';
export class WandTool extends ToolBase{
    constructor(project){
        super(project);
        let self = this;
        let tool = this.tool;   
        this.paperScope = project.paperScope;
        let item, start, dragging, visibleArea, viewarea, preview;
        let dragStartMask, currentMask, eraseMask, initMask;
        let reduceMode = false;
        let replaceMode = true;
        let floodMode = true;
        let borderColor=new paper.Color('black');
        let defaultColor=new paper.Color('magenta');
        let nullColor=new paper.Color('black');
        nullColor.alpha=0;
        let minPathArea = 50;//in pixels
        let threshold=10, minThreshold=-1, maxThreshold=100, startThreshold;

        //colorpicker
        let colorPicker = ColorpickerCursor(10,7);
        colorPicker.addTo(self.project.toolLayer);
        colorPicker.applyRescale();


        const MagicWand = makeMagicWand();

        this.setToolbarControl(new WandToolbar(this));
        this.toolbarControl.setThreshold(threshold);
        
        this.extensions.onActivate = function(){ 
            if(!item) {
                item=self.project.findSelectedPolygon(); //do not init-if-needed because we don't necessarily want to create a new polygon yet
            }
            getImageData();
            self.project.viewer.addHandler('animation-finish',getImageData); 
            colorPicker.visible=true;
        };
        this.extensions.onDeactivate = function(finished){
            self.project.viewer.removeHandler('animation-finish',getImageData);
            colorPicker.visible=false;
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
            self.deactivate();
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
                        return self.paperScope.view.viewToProject(new paper.Point(pt).add(offset));
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
            currentMask.bounds={
                minX:0,
                minY:0,
                maxX:visibleArea.width,
                maxY:visibleArea.height,
            }
            let toUnite = maskToPath(currentMask,);
            let dilated = maskToPath(currentMask,'dilate');
            //Scale the objects to account for pixel ratio
            let scalefactor=1/self.paperScope.view.pixelRatio;
            toUnite.scale(scalefactor, viewarea.bounds.topLeft);
            dilated.scale(scalefactor, viewarea.bounds.topLeft);

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
            let r = n1.set({fillColor:'magenta'}).rasterize({resolution:self.paperScope.view.resolution*self.project.getZoom(), insert:false})
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
            acc.remove.reverse().forEach(function(i){cp.removeChildren(i,i+1)});
        }
        async function getImageData(){
            let imgrect=self.project.viewer.viewport.viewportToViewerElementRectangle(self.project.viewer.world.getItemAt(0).getBounds());
            let viewrect=self.project.viewer.viewport.viewportToViewerElementRectangle(self.project.viewer.viewport.getBounds());
            let x = (Math.floor(Math.max(imgrect.x, viewrect.x))-1);
            let y = (Math.floor(Math.max(imgrect.y, viewrect.y))-1);
            let w = (Math.ceil(Math.min(viewrect.x+viewrect.width, imgrect.x+imgrect.width))-x+2);
            let h = (Math.ceil(Math.min(viewrect.y+viewrect.height, imgrect.y+imgrect.height))-y+2);
            let r = self.paperScope.view.pixelRatio;
            // console.log(x,y,w,h,r);
            visibleArea={
                x:x,
                y:y,
                width:w,
                height:h,
                data:self.project.viewer.drawer.canvas.getContext('2d').getImageData(x*r,y*r,w*r,h*r),
            }
            
            viewarea && viewarea.remove();
            viewarea = new paper.Path.Rectangle(self.paperScope.view.viewToProject(new paper.Point(x,y)),self.paperScope.view.viewToProject(new paper.Point(x+w,y+h)));                
            viewarea.fillColor='black';

            // console.log('vis',visibleArea,'view',viewarea)
            
            if(item){
                let mask = new paper.Group();
                
                let clone=item.clone();
                self.paperScope.project.activeLayer.addChild(clone);
                clone.set({fillColor:'black',strokeColor:'black'});
                let background = viewarea.subtract(clone,{insert:false});
                background.fillColor='white';
                clone.name='getImageDataClone';
                clone.remove();
                //selection.fillColor='black';
                mask.addChild(viewarea);                
                mask.addChild(background);
                // let mask = viewarea.subtract(item,{insert:false});
                let raster = mask.rasterize({resolution:self.paperScope.view.resolution*self.project.getZoom(), insert:false});
                // imgPreview.attr('src',r.toDataURL());
                let id = raster.getImageData();
                // console.log(`visArea (${w}, ${h}); id (${id.width}, ${id.height})`)
                // initMask=currentMask=new ImageData(id.width, id.height);
                initMask = {
                    width:w*r,
                    height:h*r,
                    data:new Uint8ClampedArray(w*r * h*r),
                    sampleColor:null,
                };
                currentMask = {
                    width:w*r,
                    height:h*r,
                    data:new Uint8ClampedArray(w*r * h*r),
                    sampleColor:null,
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

                console.log('Before await getAverageColor')
                await getAverageColor(self.project,item).then(sampleColor=>{
                    console.log('sampleColor computed',sampleColor)
                    let c = [sampleColor.red*255,sampleColor.green*255,sampleColor.blue*255];
                    initMask.sampleColor = c;
                    currentMask.sampleColor = c;
                    rasterPreview(currentMask,new paper.Point(x,y),true);
                });
                console.log('After await getAverageColor')
            }
            viewarea.visible=false;
                
        }
        function applyMagicWand(eventPoint){
            // preview && preview.remove();
            let offset = new paper.Point(visibleArea.x,visibleArea.y);
            let pt = self.paperScope.view.projectToView(eventPoint).subtract(offset);
            if(pt.x<0 || pt.y<0 || pt.x>visibleArea.width || pt.y>visibleArea.height) return;
            //account for pixel density
            let r = self.paperScope.view.pixelRatio
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
                    currentMask.sampleColor = eraseMask.sampleColor || dragStartMask.sampleColor;
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
                    currentMask.sampleColor = eraseMask.sampleColor || dragStartMask.sampleColor;
                }
                else{
                    // console.log('Erase mode off')                    
                    currentMask = MagicWand.thresholdMask(i,Math.round(pt.x),Math.round(pt.y),threshold) || currentMask;
                    currentMask = concatMasks(currentMask,dragStartMask);
                }
            }
            
            
            rasterPreview(currentMask, offset,false);
            
        }
        
        function rasterPreview(mask, offset,drawBorder){
            let rasterSize=new paper.Size(mask.width,mask.height);
            preview && preview.remove();
            preview = new paper.Raster(rasterSize);
            let pos = self.paperScope.view.viewToProject(offset).add(rasterSize.divide(2 * self.paperScope.view.pixelRatio));
            //Scale the preview and position to account for pixel ratio
            preview.scale(1/self.paperScope.view.pixelRatio);
                       
            
            self.project.toolLayer.addChild(preview);
            let id = preview.createImageData(preview.size);
            let cmap = {0: nullColor, 1: defaultColor};
            

            //If a sample color is known, "invert" it for better contrast relative to background image
            if(mask.sampleColor){
                cmap[1] = new paper.Color(mask.sampleColor[0],mask.sampleColor[1],mask.sampleColor[2]);
                cmap[1].hue+=180;
                cmap[1].brightness=360-cmap[1].brightness;
            }
            
            let c;
            for(var mx = 0, ix=0; mx<mask.data.length; mx+=1, ix += 4){
                c = cmap[mask.data[mx]];
                id.data[ix]   = c.red;   //red
                id.data[ix+1] = c.green; //green
                id.data[ix+2] = c.blue; //blue
                // id.data[ix]   = c.red*255;   //red
                // id.data[ix+1] = c.green*255; //green
                // id.data[ix+2] = c.blue*255; //blue
                
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
            function tween1(){preview.tweenTo({opacity:0.15},{duration:1200,easing:'easeInQuart'}).then(tween2);}
            function tween2(){preview.tweenTo({opacity:1},{duration:800,easing:'easeOutCubic'}).then(tween1);}
            tween1();
        }
            
        tool.onMouseDown=function(ev){
            dragging=true;
            start = ev.point;
            startThreshold=threshold;
            dragStartMask = (replaceMode) ? initMask : currentMask;
            applyMagicWand(start);
            colorPicker.visible=false;     
        }
        tool.onMouseMove=function(ev){
            if(dragging){
                let delta = ev.point.subtract(start).multiply(self.project.getZoom());
                if(reduceMode) delta = delta.multiply(-1); //invert effect of dragging when in reduce mode for more intuitive user experience
                let s=Math.round((delta.x+delta.y*-1)/2);
                threshold=Math.min(Math.max(startThreshold+s, minThreshold), maxThreshold);
                if(Number.isNaN(threshold)){
                    console.log('wft nan??');
                }
                self.toolbarControl.setThreshold(threshold);
                applyMagicWand(start);
            }
            else{
                colorPicker.visible=true;
            }
            colorPicker.position=ev.point;
            let o = self.project.viewer.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(ev.point.x,ev.point.y));
            let x = Math.round(o.x)-Math.floor(colorPicker.numColumns/2);
            let y = Math.round(o.y)-Math.floor(colorPicker.numRows/2);
            let w = colorPicker.numColumns;
            let h = colorPicker.numRows;
            let r = self.paperScope.view.pixelRatio            
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
                    colorPicker.children[p].fillColor.red = getval(i);
                    colorPicker.children[p].fillColor.green = getval(i+1);
                    colorPicker.children[p].fillColor.blue = getval(i+2);
                }
            }
            colorPicker.borderElement.fillColor = colorPicker.centerCell.fillColor;
            colorPicker.selectedColor = colorPicker.centerCell.fillColor;  
        }
        tool.onMouseUp=function(ev){
            dragging=false;
            if(dragging) colorPicker.visible=true;
            colorPicker.bringToFront();
        }
        
        tool.extensions.onKeyUp=function(ev){
            // console.log(`Key up on ${ev.key} key`)
            if(ev.key=='a'){
                self.applyChanges();
            }
            if(ev.key=='e'){
                reduceMode = !reduceMode;
                self.toolbarControl.setReduceMode(reduceMode);
            }
            if(ev.key=='r'){
                replaceMode = !replaceMode;
                self.toolbarControl.setReplaceMode(replaceMode);
            }
            if(ev.key=='f'){
                floodMode = !floodMode;
                self.toolbarControl.setFloodMode(floodMode);
            }
        }
    } 
}

class WandToolbar extends ToolbarBase{
    constructor(wandTool){
        super(wandTool);
        let html = $('<i>',{class:"fa-solid fa-wand-magic-sparkles fa-rotate-270"});
        this.button.configure(html,'Magic Wand Tool');
        
        let fdd = $('<div>',{'data-tool':'wand',class:'dropdown wand-toolbar'}).appendTo(this.dropdown);
        let thr = $('<div>',{class:'threshold-container'}).appendTo(fdd);
        $('<label>').text('Threshold').appendTo(thr)
        this.thresholdInput=$('<input>',{type:'range',min:-1,max:100,value:20}).appendTo(thr).on('change',function(){
            //console.log('Range input changed',$(this).val());
            wandTool.setThreshold($(this).val());
        });
        
        let toggles=$('<div>',{class:'toggles'}).appendTo(fdd);
        // this.floodInput=$('<input>',{type:'checkbox',checked:true,'data-size':"small",'data-action':'flood'}).appendTo(toggles).on('change',function(e){
        //     wandTool.setFloodMode($(this).prop('checked'));
        //     console.log('Wand flood set:',$(this).prop('checked'),e);
        //     e.stopImmediatePropagation();
        // }).bootstrapToggle({
        //     on:'Flood<br>fill',
        //     off:'Full<br>viewport',
        //     width:'100%',
        //     height:'100%'
        // });
        // this.reduceInput=$('<input>',{type:'checkbox',checked:true,'data-size':"small",'data-action':'erase'}).appendTo(toggles).on('change',function(){
        //     wandTool.setReduceMode(!$(this).prop('checked'));
        //     // console.log('Wand erase set:',!$(this).prop('checked'));
        // }).bootstrapToggle({
        //     off:'Reduce<br>area',
        //     on:'Expand<br>area',
        //     width:'100%',
        //     height:'100%'
        // });
        // this.replaceInput=$('<input>',{type:'checkbox',checked:true,'data-size':"small",'data-action':'replace'}).appendTo(toggles).on('change',function(){
        //     wandTool.setReplaceMode($(this).prop('checked'));
        //     // console.log('Wand replace set:',!$(this).prop('checked'));
        // }).bootstrapToggle({
        //     on:'Replace<br>mask',
        //     off:'Keep<br>mask',
        //     width:'100%',
        //     height:'100%'
        // });
        
        //this.replaceInput=
        $('<span>',{class:'option-toggle'}).appendTo(toggles)
            .data({
                prefix:'On click:',
                actions:[{replace:'Start new mask'}, {append:'Add to current'}],
                onclick:function(action){
                    wandTool.setReplaceMode(action=='replace');
                }
            })
        //this.floodInput=
        $('<span>',{class:'option-toggle'}).appendTo(toggles)
            .data({
                prefix:'Fill rule:',
                actions:[{flood:'Contiguous'}, {everywhere:'Anywhere'}],
                onclick:function(action){
                    wandTool.setFloodMode(action=='flood')
                }
            });
        //this.reduceInput=
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
            // let current=data.actions[0]
            // let option = $('<span>',{class:'action'}).text(Object.values(current)[0]).appendTo(item).data({key:Object.keys(current)[0],index:0});
            // option.on('click',function(){
            //     let optionToggle=$(this).closest('.option-toggle')
            //     let actions=optionToggle.data('actions');
            //     let currentIndex=$(this).data('index');
            //     let actionIndex = (++currentIndex) % actions.length;
            //     let action = actions[actionIndex];
            //     $(this).text(Object.values(action)[0]).data({key:Object.keys(action)[0],index:actionIndex});
            //     optionToggle.data('onclick')(Object.keys(action)[0]);
            // })
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
    // setFloodMode(floodmode){
    //     this.floodInput.prop('checked') !=floodmode && this.floodInput.prop('checked',floodmode).trigger('change');
    // }
    // setReduceMode(reduceMode){
    //     this.reduceInput.prop('checked') ==reduceMode && this.reduceInput.prop('checked',reduceMode).trigger('change');
    //     //the above line is inverted from the others, on purpose (== instead of !=)
    // }
    // setReplaceMode(replacemode){
    //     this.replaceInput.prop('checked') !=replacemode && this.replaceInput.prop('checked',replacemode).trigger('change');
    // }
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
        bounds: a.bounds,
        sampleColor: a.sampleColor
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

////// MagicWand.js
    // https://github.com/Tamersoul/magic-wand-js a3b0903 last modified Oct 13, 2020, downloaded 9/21/21 
    // The MIT License (MIT)

    // Copyright (c) 2014, Ryasnoy Paul (ryasnoypaul@gmail.com)

    // Permission is hereby granted, free of charge, to any person obtaining a copy
    // of this software and associated documentation files (the "Software"), to deal
    // in the Software without restriction, including without limitation the rights
    // to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    // copies of the Software, and to permit persons to whom the Software is
    // furnished to do so, subject to the following conditions:

    // The above copyright notice and this permission notice shall be included in all
    // copies or substantial portions of the Software.

    // THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    // IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    // FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    // AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    // LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    // OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    // SOFTWARE.
    
    
function makeMagicWand() {
    var lib = {};

    /** Create a binary mask on the image by color threshold
     * Algorithm: Scanline flood fill (http://en.wikipedia.org/wiki/Flood_fill)
     * @param {Object} image: {Uint8Array} data, {int} width, {int} height, {int} bytes
     * @param {int} x of start pixel
     * @param {int} y of start pixel
     * @param {int} color threshold
     * @param {Uint8Array} mask of visited points (optional) 
     * @param {boolean} [includeBorders=false] indicate whether to include borders pixels
     * @return {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
     */
    lib.floodFill = function(image, px, py, colorThreshold, mask, includeBorders) {
        return includeBorders
            ? floodFillWithBorders(image, px, py, colorThreshold, mask)
            : floodFillWithoutBorders(image, px, py, colorThreshold, mask);
    };

    function floodFillWithoutBorders(image, px, py, colorThreshold, mask) {

        var c, x, newY, el, xr, xl, dy, dyl, dyr, checkY,
            data = image.data,
            w = image.width,
            h = image.height,
            bytes = image.bytes, // number of bytes in the color
            maxX = -1, minX = w + 1, maxY = -1, minY = h + 1,
            i = py * w + px, // start point index in the mask data
            result = new Uint8Array(w * h), // result mask
            visited = new Uint8Array(mask ? mask : w * h); // mask of visited points

        if (visited[i] === 1) return null;

        i = i * bytes; // start point index in the image data
        var sampleColor = [data[i], data[i + 1], data[i + 2], data[i + 3]]; // start point color (sample)

        var stack = [{ y: py, left: px - 1, right: px + 1, dir: 1 }]; // first scanning line
        do {
            el = stack.shift(); // get line for scanning

            checkY = false;
            for (x = el.left + 1; x < el.right; x++) {
                dy = el.y * w;
                i = (dy + x) * bytes; // point index in the image data

                if (visited[dy + x] === 1) continue; // check whether the point has been visited
                // compare the color of the sample
                c = data[i] - sampleColor[0]; // check by red
                if (c > colorThreshold || c < -colorThreshold) continue;
                c = data[i + 1] - sampleColor[1]; // check by green
                if (c > colorThreshold || c < -colorThreshold) continue;
                c = data[i + 2] - sampleColor[2]; // check by blue
                if (c > colorThreshold || c < -colorThreshold) continue;

                checkY = true; // if the color of the new point(x,y) is similar to the sample color need to check minmax for Y 

                result[dy + x] = 1; // mark a new point in mask
                visited[dy + x] = 1; // mark a new point as visited

                xl = x - 1;
                // walk to left side starting with the left neighbor
                while (xl > -1) {
                    dyl = dy + xl;
                    i = dyl * bytes; // point index in the image data
                    if (visited[dyl] === 1) break; // check whether the point has been visited
                    // compare the color of the sample
                    c = data[i] - sampleColor[0]; // check by red
                    if (c > colorThreshold || c < -colorThreshold) break;
                    c = data[i + 1] - sampleColor[1]; // check by green
                    if (c > colorThreshold || c < -colorThreshold) break;
                    c = data[i + 2] - sampleColor[2]; // check by blue
                    if (c > colorThreshold || c < -colorThreshold) break;

                    result[dyl] = 1;
                    visited[dyl] = 1;

                    xl--;
                }
                xr = x + 1;
                // walk to right side starting with the right neighbor
                while (xr < w) {
                    dyr = dy + xr;
                    i = dyr * bytes; // index point in the image data
                    if (visited[dyr] === 1) break; // check whether the point has been visited
                    // compare the color of the sample
                    c = data[i] - sampleColor[0]; // check by red
                    if (c > colorThreshold || c < -colorThreshold) break;
                    c = data[i + 1] - sampleColor[1]; // check by green
                    if (c > colorThreshold || c < -colorThreshold) break;
                    c = data[i + 2] - sampleColor[2]; // check by blue
                    if (c > colorThreshold || c < -colorThreshold) break;

                    result[dyr] = 1;
                    visited[dyr] = 1;

                    xr++;
                }

                // check minmax for X
                if (xl < minX) minX = xl + 1;
                if (xr > maxX) maxX = xr - 1;

                newY = el.y - el.dir;
                if (newY >= 0 && newY < h) { // add two scanning lines in the opposite direction (y - dir) if necessary
                    if (xl < el.left) stack.push({ y: newY, left: xl, right: el.left, dir: -el.dir }); // from "new left" to "current left"
                    if (el.right < xr) stack.push({ y: newY, left: el.right, right: xr, dir: -el.dir }); // from "current right" to "new right"
                }
                newY = el.y + el.dir;
                if (newY >= 0 && newY < h) { // add the scanning line in the direction (y + dir) if necessary
                    if (xl < xr) stack.push({ y: newY, left: xl, right: xr, dir: el.dir }); // from "new left" to "new right"
                }
            }
            // check minmax for Y if necessary
            if (checkY) {
                if (el.y < minY) minY = el.y;
                if (el.y > maxY) maxY = el.y;
            }
        } while (stack.length > 0);

        return {
            data: result,
            width: image.width,
            height: image.height,
            bounds: {
                minX: minX,
                minY: minY,
                maxX: maxX,
                maxY: maxY
            },
            sampleColor:sampleColor,
        };
    };

    function floodFillWithBorders(image, px, py, colorThreshold, mask) {

        var c, x, newY, el, xr, xl, dy, dyl, dyr, checkY,
            data = image.data,
            w = image.width,
            h = image.height,
            bytes = image.bytes, // number of bytes in the color
            maxX = -1, minX = w + 1, maxY = -1, minY = h + 1,
            i = py * w + px, // start point index in the mask data
            result = new Uint8Array(w * h), // result mask
            visited = new Uint8Array(mask ? mask : w * h); // mask of visited points

        if (visited[i] === 1) return null;

        i = i * bytes; // start point index in the image data
        var sampleColor = [data[i], data[i + 1], data[i + 2], data[i + 3]]; // start point color (sample)

        var stack = [{ y: py, left: px - 1, right: px + 1, dir: 1 }]; // first scanning line
        do {
            el = stack.shift(); // get line for scanning

            checkY = false;
            for (x = el.left + 1; x < el.right; x++) {
                dy = el.y * w;
                i = (dy + x) * bytes; // point index in the image data

                if (visited[dy + x] === 1) continue; // check whether the point has been visited

                checkY = true; // if the color of the new point(x,y) is similar to the sample color need to check minmax for Y 

                result[dy + x] = 1; // mark a new point in mask
                visited[dy + x] = 1; // mark a new point as visited

                // compare the color of the sample
                c = data[i] - sampleColor[0]; // check by red
                if (c > colorThreshold || c < -colorThreshold) continue;
                c = data[i + 1] - sampleColor[1]; // check by green
                if (c > colorThreshold || c < -colorThreshold) continue;
                c = data[i + 2] - sampleColor[2]; // check by blue
                if (c > colorThreshold || c < -colorThreshold) continue;

                xl = x - 1;
                // walk to left side starting with the left neighbor
                while (xl > -1) {
                    dyl = dy + xl;
                    i = dyl * bytes; // point index in the image data
                    if (visited[dyl] === 1) break; // check whether the point has been visited

                    result[dyl] = 1;
                    visited[dyl] = 1;
                    xl--;

                    // compare the color of the sample
                    c = data[i] - sampleColor[0]; // check by red
                    if (c > colorThreshold || c < -colorThreshold) break;
                    c = data[i + 1] - sampleColor[1]; // check by green
                    if (c > colorThreshold || c < -colorThreshold) break;
                    c = data[i + 2] - sampleColor[2]; // check by blue
                    if (c > colorThreshold || c < -colorThreshold) break;
                }
                xr = x + 1;
                // walk to right side starting with the right neighbor
                while (xr < w) {
                    dyr = dy + xr;
                    i = dyr * bytes; // index point in the image data
                    if (visited[dyr] === 1) break; // check whether the point has been visited

                    result[dyr] = 1;
                    visited[dyr] = 1;
                    xr++;

                    // compare the color of the sample
                    c = data[i] - sampleColor[0]; // check by red
                    if (c > colorThreshold || c < -colorThreshold) break;
                    c = data[i + 1] - sampleColor[1]; // check by green
                    if (c > colorThreshold || c < -colorThreshold) break;
                    c = data[i + 2] - sampleColor[2]; // check by blue
                    if (c > colorThreshold || c < -colorThreshold) break;
                }

                // check minmax for X
                if (xl < minX) minX = xl + 1;
                if (xr > maxX) maxX = xr - 1;

                newY = el.y - el.dir;
                if (newY >= 0 && newY < h) { // add two scanning lines in the opposite direction (y - dir) if necessary
                    if (xl < el.left) stack.push({ y: newY, left: xl, right: el.left, dir: -el.dir }); // from "new left" to "current left"
                    if (el.right < xr) stack.push({ y: newY, left: el.right, right: xr, dir: -el.dir }); // from "current right" to "new right"
                }
                newY = el.y + el.dir;
                if (newY >= 0 && newY < h) { // add the scanning line in the direction (y + dir) if necessary
                    if (xl < xr) stack.push({ y: newY, left: xl, right: xr, dir: el.dir }); // from "new left" to "new right"
                }
            }
            // check minmax for Y if necessary
            if (checkY) {
                if (el.y < minY) minY = el.y;
                if (el.y > maxY) maxY = el.y;
            }
        } while (stack.length > 0);

        return {
            data: result,
            width: image.width,
            height: image.height,
            bounds: {
                minX: minX,
                minY: minY,
                maxX: maxX,
                maxY: maxY
            },
            sampleColor:sampleColor,
        };
    };

    lib.thresholdMask = function(image, px, py, colorThreshold, masks={}) {

        let c, r,
            data = image.data,
            w = image.width,
            h = image.height,
            bytes = image.bytes, // number of bytes in the color
            i = py * w + px, // start point index in the mask data
            result = new Uint8Array(masks.append ? masks.append :w * h), // result mask
            ignore = new Uint8Array(masks.ignore ? masks.ignore : w * h); // mask of points to ignore

        if (ignore[i] === 1) return null;

        i = i * bytes; // start point index in the image data
        var sampleColor = [data[i], data[i + 1], data[i + 2], data[i + 3]]; // start point color (sample)
        
        for(i = 0, r = 0; i<data.length; i+=4, r+=1){
            if(ignore[r] || result[r]) continue;
            // compare the color of the sample
            c = data[i] - sampleColor[0]; // check by red
            if (c > colorThreshold || c < -colorThreshold) continue;
            c = data[i + 1] - sampleColor[1]; // check by green
            if (c > colorThreshold || c < -colorThreshold) continue;
            c = data[i + 2] - sampleColor[2]; // check by blue
            if (c > colorThreshold || c < -colorThreshold) continue;

            result[r]=1;

        }

        return {
            data: result,
            width: image.width,
            height: image.height,
            bounds: {
                minX: 0,
                minY: 0,
                maxX: w,
                maxY: h
            },
            sampleColor:sampleColor,
        };
    };


    /** Apply the gauss-blur filter to binary mask
        * Algorithms: http://blog.ivank.net/fastest-gaussian-blur.html
        * http://www.librow.com/articles/article-9
        * http://elynxsdk.free.fr/ext-docs/Blur/Fast_box_blur.pdf
        * @param {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
        * @param {int} blur radius
        * @return {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
        */
    lib.gaussBlur = function(mask, radius) {

        var i, k, k1, x, y, val, start, end,
            n = radius * 2 + 1, // size of the pattern for radius-neighbors (from -r to +r with the center point)
            s2 = radius * radius,
            wg = new Float32Array(n), // weights
            total = 0, // sum of weights(used for normalization)
            w = mask.width,
            h = mask.height,
            data = mask.data,
            minX = mask.bounds.minX,
            maxX = mask.bounds.maxX,
            minY = mask.bounds.minY,
            maxY = mask.bounds.maxY;

        // calc gauss weights
        for (i = 0; i < radius; i++) {
            var dsq = (radius - i) * (radius - i);
            var ww = Math.exp(-dsq / (2.0 * s2)) / (2 * Math.PI * s2);
            wg[radius + i] = wg[radius - i] = ww;
            total += 2 * ww;
        }
        // normalization weights
        for (i = 0; i < n; i++) {
            wg[i] /= total;
        }

        var result = new Uint8Array(w * h), // result mask
            endX = radius + w,
            endY = radius + h;

        //walk through all source points for blur
        for (y = minY; y < maxY + 1; y++)
            for (x = minX; x < maxX + 1; x++) {
                val = 0;
                k = y * w + x; // index of the point
                start = radius - x > 0 ? radius - x : 0;
                end = endX - x < n ? endX - x : n; // Math.min((((w - 1) - x) + radius) + 1, n);
                k1 = k - radius;
                // walk through x-neighbors
                for (i = start; i < end; i++) {
                    val += data[k1 + i] * wg[i];
                }
                start = radius - y > 0 ? radius - y : 0;
                end = endY - y < n ? endY - y : n; // Math.min((((h - 1) - y) + radius) + 1, n);
                k1 = k - radius * w;
                // walk through y-neighbors
                for (i = start; i < end; i++) {
                    val += data[k1 + i * w] * wg[i];
                }
                result[k] = val > 0.5 ? 1 : 0;
            }

        return {
            data: result,
            width: w,
            height: h,
            bounds: {
                minX: minX,
                minY: minY,
                maxX: maxX,
                maxY: maxY
            }
        };
    };

    /** Create a border index array of boundary points of the mask with radius-neighbors
        * @param {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
        * @param {int} blur radius
        * @param {Uint8Array} visited: mask of visited points (optional) 
        * @return {Array} border index array of boundary points with radius-neighbors (only points need for blur)
        */
    function createBorderForBlur(mask, radius, visited) {

        var x, i, j, y, k, k1, k2,
            w = mask.width,
            h = mask.height,
            data = mask.data,
            visitedData = new Uint8Array(data),
            minX = mask.bounds.minX,
            maxX = mask.bounds.maxX,
            minY = mask.bounds.minY,
            maxY = mask.bounds.maxY,
            len = w * h,
            temp = new Uint8Array(len), // auxiliary array to check uniqueness
            border = [], // only border points
            x0 = Math.max(minX, 1),
            x1 = Math.min(maxX, w - 2),
            y0 = Math.max(minY, 1),
            y1 = Math.min(maxY, h - 2);

        if (visited && visited.length > 0) {
            // copy visited points (only "black")
            for (k = 0; k < len; k++) {
                if (visited[k] === 1) visitedData[k] = 1;
            }
        }

        // walk through inner values except points on the boundary of the image
        for (y = y0; y < y1 + 1; y++)
            for (x = x0; x < x1 + 1; x++) {
                k = y * w + x;
                if (data[k] === 0) continue; // "white" point isn't the border
                k1 = k + w; // y + 1
                k2 = k - w; // y - 1
                // check if any neighbor with a "white" color
                if (visitedData[k + 1] === 0 || visitedData[k - 1] === 0 ||
                    visitedData[k1] === 0 || visitedData[k1 + 1] === 0 || visitedData[k1 - 1] === 0 ||
                    visitedData[k2] === 0 || visitedData[k2 + 1] === 0 || visitedData[k2 - 1] === 0) {
                    //if (visitedData[k + 1] + visitedData[k - 1] + 
                    //    visitedData[k1] + visitedData[k1 + 1] + visitedData[k1 - 1] +
                    //    visitedData[k2] + visitedData[k2 + 1] + visitedData[k2 - 1] == 8) continue;
                    border.push(k);
                }
            }

        // walk through points on the boundary of the image if necessary
        // if the "black" point is adjacent to the boundary of the image, it is a border point
        if (minX == 0)
            for (y = minY; y < maxY + 1; y++)
                if (data[y * w] === 1)
                    border.push(y * w);

        if (maxX == w - 1)
            for (y = minY; y < maxY + 1; y++)
                if (data[y * w + maxX] === 1)
                    border.push(y * w + maxX);

        if (minY == 0)
            for (x = minX; x < maxX + 1; x++)
                if (data[x] === 1)
                    border.push(x);

        if (maxY == h - 1)
            for (x = minX; x < maxX + 1; x++)
                if (data[maxY * w + x] === 1)
                    border.push(maxY * w + x);

        var result = [], // border points with radius-neighbors
            start, end,
            endX = radius + w,
            endY = radius + h,
            n = radius * 2 + 1; // size of the pattern for radius-neighbors (from -r to +r with the center point)

        len = border.length;
        // walk through radius-neighbors of border points and add them to the result array
        for (j = 0; j < len; j++) {
            k = border[j]; // index of the border point
            temp[k] = 1; // mark border point
            result.push(k); // save the border point
            x = k % w; // calc x by index
            y = (k - x) / w; // calc y by index
            start = radius - x > 0 ? radius - x : 0;
            end = endX - x < n ? endX - x : n; // Math.min((((w - 1) - x) + radius) + 1, n);
            k1 = k - radius;
            // walk through x-neighbors
            for (i = start; i < end; i++) {
                k2 = k1 + i;
                if (temp[k2] === 0) { // check the uniqueness
                    temp[k2] = 1;
                    result.push(k2);
                }
            }
            start = radius - y > 0 ? radius - y : 0;
            end = endY - y < n ? endY - y : n; // Math.min((((h - 1) - y) + radius) + 1, n);
            k1 = k - radius * w;
            // walk through y-neighbors
            for (i = start; i < end; i++) {
                k2 = k1 + i * w;
                if (temp[k2] === 0) { // check the uniqueness
                    temp[k2] = 1;
                    result.push(k2);
                }
            }
        }

        return result;
    };

    /** Apply the gauss-blur filter ONLY to border points with radius-neighbors
        * Algorithms: http://blog.ivank.net/fastest-gaussian-blur.html
        * http://www.librow.com/articles/article-9
        * http://elynxsdk.free.fr/ext-docs/Blur/Fast_box_blur.pdf
        * @param {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
        * @param {int} blur radius
        * @param {Uint8Array} visited: mask of visited points (optional) 
        * @return {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
        */
    lib.gaussBlurOnlyBorder = function(mask, radius, visited) {

        var border = createBorderForBlur(mask, radius, visited), // get border points with radius-neighbors
            ww, dsq, i, j, k, k1, x, y, val, start, end,
            n = radius * 2 + 1, // size of the pattern for radius-neighbors (from -r to +r with center point)
            s2 = 2 * radius * radius,
            wg = new Float32Array(n), // weights
            total = 0, // sum of weights(used for normalization)
            w = mask.width,
            h = mask.height,
            data = mask.data,
            minX = mask.bounds.minX,
            maxX = mask.bounds.maxX,
            minY = mask.bounds.minY,
            maxY = mask.bounds.maxY,
            len = border.length;

        // calc gauss weights
        for (i = 0; i < radius; i++) {
            dsq = (radius - i) * (radius - i);
            ww = Math.exp(-dsq / s2) / Math.PI;
            wg[radius + i] = wg[radius - i] = ww;
            total += 2 * ww;
        }
        // normalization weights
        for (i = 0; i < n; i++) {
            wg[i] /= total;
        }

        var result = new Uint8Array(data), // copy the source mask
            endX = radius + w,
            endY = radius + h;

        //walk through all border points for blur
        for (i = 0; i < len; i++) {
            k = border[i]; // index of the border point
            val = 0;
            x = k % w; // calc x by index
            y = (k - x) / w; // calc y by index
            start = radius - x > 0 ? radius - x : 0;
            end = endX - x < n ? endX - x : n; // Math.min((((w - 1) - x) + radius) + 1, n);
            k1 = k - radius;
            // walk through x-neighbors
            for (j = start; j < end; j++) {
                val += data[k1 + j] * wg[j];
            }
            if (val > 0.5) {
                result[k] = 1;
                // check minmax
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                continue;
            }
            start = radius - y > 0 ? radius - y : 0;
            end = endY - y < n ? endY - y : n; // Math.min((((h - 1) - y) + radius) + 1, n);
            k1 = k - radius * w;
            // walk through y-neighbors
            for (j = start; j < end; j++) {
                val += data[k1 + j * w] * wg[j];
            }
            if (val > 0.5) {
                result[k] = 1;
                // check minmax
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            } else {
                result[k] = 0;
            }
        }

        return {
            data: result,
            width: w,
            height: h,
            bounds: {
                minX: minX,
                minY: minY,
                maxX: maxX,
                maxY: maxY
            }
        };
    };

    /** Create a border mask (only boundary points)
        * @param {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
        * @return {Object} border mask: {Uint8Array} data, {int} width, {int} height, {Object} offset
        */
    lib.createBorderMask = function(mask) {

        var x, y, k, k1, k2,
            w = mask.width,
            h = mask.height,
            data = mask.data,
            minX = mask.bounds.minX,
            maxX = mask.bounds.maxX,
            minY = mask.bounds.minY,
            maxY = mask.bounds.maxY,
            rw = maxX - minX + 1, // bounds size
            rh = maxY - minY + 1,
            result = new Uint8Array(rw * rh), // reduced mask (bounds size)
            x0 = Math.max(minX, 1),
            x1 = Math.min(maxX, w - 2),
            y0 = Math.max(minY, 1),
            y1 = Math.min(maxY, h - 2);

        // walk through inner values except points on the boundary of the image
        for (y = y0; y < y1 + 1; y++)
            for (x = x0; x < x1 + 1; x++) {
                k = y * w + x;
                if (data[k] === 0) continue; // "white" point isn't the border
                k1 = k + w; // y + 1
                k2 = k - w; // y - 1
                // check if any neighbor with a "white" color
                if (data[k + 1] === 0 || data[k - 1] === 0 ||
                    data[k1] === 0 || data[k1 + 1] === 0 || data[k1 - 1] === 0 ||
                    data[k2] === 0 || data[k2 + 1] === 0 || data[k2 - 1] === 0) {
                    //if (data[k + 1] + data[k - 1] + 
                    //    data[k1] + data[k1 + 1] + data[k1 - 1] +
                    //    data[k2] + data[k2 + 1] + data[k2 - 1] == 8) continue;
                    result[(y - minY) * rw + (x - minX)] = 1;
                }
            }

        // walk through points on the boundary of the image if necessary
        // if the "black" point is adjacent to the boundary of the image, it is a border point
        if (minX == 0)
            for (y = minY; y < maxY + 1; y++)
                if (data[y * w] === 1)
                    result[(y - minY) * rw] = 1;

        if (maxX == w - 1)
            for (y = minY; y < maxY + 1; y++)
                if (data[y * w + maxX] === 1)
                    result[(y - minY) * rw + (maxX - minX)] = 1;

        if (minY == 0)
            for (x = minX; x < maxX + 1; x++)
                if (data[x] === 1)
                    result[x - minX] = 1;

        if (maxY == h - 1)
            for (x = minX; x < maxX + 1; x++)
                if (data[maxY * w + x] === 1)
                    result[(maxY - minY) * rw + (x - minX)] = 1;

        return {
            data: result,
            width: rw,
            height: rh,
            offset: { x: minX, y: minY }
        };
    };
    
    /** Create a border index array of boundary points of the mask
        * @param {Object} mask: {Uint8Array} data, {int} width, {int} height
        * @return {Array} border index array boundary points of the mask
        */
    lib.getBorderIndices = function(mask) {

        var x, y, k, k1, k2,
            w = mask.width,
            h = mask.height,
            data = mask.data,
            border = [], // only border points
            x1 = w - 1,
            y1 = h - 1;

        // walk through inner values except points on the boundary of the image
        for (y = 1; y < y1; y++)
            for (x = 1; x < x1; x++) {
                k = y * w + x;
                if (data[k] === 0) continue; // "white" point isn't the border
                k1 = k + w; // y + 1
                k2 = k - w; // y - 1
                // check if any neighbor with a "white" color
                if (data[k + 1] === 0 || data[k - 1] === 0 ||
                    data[k1] === 0 || data[k1 + 1] === 0 || data[k1 - 1] === 0 ||
                    data[k2] === 0 || data[k2 + 1] === 0 || data[k2 - 1] === 0) {
                    //if (data[k + 1] + data[k - 1] + 
                    //    data[k1] + data[k1 + 1] + data[k1 - 1] +
                    //    data[k2] + data[k2 + 1] + data[k2 - 1] == 8) continue;
                    border.push(k);
                }
            }

        // walk through points on the boundary of the image if necessary
        // if the "black" point is adjacent to the boundary of the image, it is a border point
        for (y = 0; y < h; y++)
            if (data[y * w] === 1)
                border.push(y * w);

        for (x = 0; x < w; x++)
            if (data[x] === 1)
                border.push(x);

        k = w - 1;
        for (y = 0; y < h; y++)
            if (data[y * w + k] === 1)
                border.push(y * w + k);

        k = (h - 1) * w;
        for (x = 0; x < w; x++)
            if (data[k + x] === 1)
                border.push(k + x);

        return border;
    };
    
    /** Create a compressed mask with a "white" border (1px border with zero values) for the contour tracing
        * @param {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
        * @return {Object} border mask: {Uint8Array} data, {int} width, {int} height, {Object} offset
        */
    function prepareMask(mask) {
        var x, y,
            w = mask.width,
            data = mask.data,
            minX = mask.bounds.minX,
            maxX = mask.bounds.maxX,
            minY = mask.bounds.minY,
            maxY = mask.bounds.maxY,
            rw = maxX - minX + 3, // bounds size +1 px on each side (a "white" border)
            rh = maxY - minY + 3,
            result = new Uint8Array(rw * rh); // reduced mask (bounds size)

        // walk through inner values and copy only "black" points to the result mask
        for (y = minY; y < maxY + 1; y++)
            for (x = minX; x < maxX + 1; x++) {
                if (data[y * w + x] === 1)
                    result[(y - minY + 1) * rw + (x - minX + 1)] = 1;
            }

        return {
            data: result,
            width: rw,
            height: rh,
            offset: { x: minX - 1, y: minY - 1 }
        };
    };
        
    /** Create a contour array for the binary mask
        * Algorithm: http://www.sciencedirect.com/science/article/pii/S1077314203001401
        * @param {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
        * @return {Array} contours: {Array} points, {bool} inner, {int} label
        */
    lib.traceContours = function(mask) {
        var m = prepareMask(mask),
            contours = [],
            label = 0,
            w = m.width,
            w2 = w * 2,
            h = m.height,
            src = m.data,
            dx = m.offset.x,
            dy = m.offset.y,
            dest = new Uint8Array(src), // label matrix
            i, j, x, y, k, k1, c, inner, dir, first, second, current, previous, next, d;

        // all [dx,dy] pairs (array index is the direction)
        // 5 6 7
        // 4 X 0
        // 3 2 1
        var directions = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

        for (y = 1; y < h - 1; y++)
            for (x = 1; x < w - 1; x++) {
                k = y * w + x;
                if (src[k] === 1) {
                    for (i = -w; i < w2; i += w2) { // k - w: outer tracing (y - 1), k + w: inner tracing (y + 1)
                        if (src[k + i] === 0 && dest[k + i] === 0) { // need contour tracing
                            inner = i === w; // is inner contour tracing ?
                            label++; // label for the next contour

                            c = [];
                            dir = inner ? 2 : 6; // start direction
                            current = previous = first = { x: x, y: y };
                            second = null;
                            while (true) {
                                dest[current.y * w + current.x] = label; // mark label for the current point 
                                // bypass all the neighbors around the current point in a clockwise
                                for (j = 0; j < 8; j++) {
                                    dir = (dir + 1) % 8;

                                    // get the next point by new direction
                                    d = directions[dir]; // index as direction
                                    next = { x: current.x + d[0], y: current.y + d[1] };

                                    k1 = next.y * w + next.x;
                                    if (src[k1] === 1) // black boundary pixel
                                    {
                                        dest[k1] = label; // mark a label
                                        break;
                                    }
                                    dest[k1] = -1; // mark a white boundary pixel
                                    next = null;
                                }
                                if (next === null) break; // no neighbours (one-point contour)
                                current = next;
                                if (second) {
                                    if (previous.x === first.x && previous.y === first.y && current.x === second.x && current.y === second.y) {
                                        break; // creating the contour completed when returned to original position
                                    }
                                } else {
                                    second = next;
                                }
                                c.push({ x: previous.x + dx, y: previous.y + dy });
                                previous = current;
                                dir = (dir + 4) % 8; // next dir (symmetrically to the current direction)
                            }

                            if (next != null) {
                                c.push({ x: first.x + dx, y: first.y + dy }); // close the contour
                                contours.push({ inner: inner, label: label, points: c }); // add contour to the list
                            }
                        }
                    }
                }
            }

        return contours;
    };
    
    /** Simplify contours
        * Algorithms: http://psimpl.sourceforge.net/douglas-peucker.html 
        * http://neerc.ifmo.ru/wiki/index.php?title=%D0%A3%D0%BF%D1%80%D0%BE%D1%89%D0%B5%D0%BD%D0%B8%D0%B5_%D0%BF%D0%BE%D0%BB%D0%B8%D0%B3%D0%BE%D0%BD%D0%B0%D0%BB%D1%8C%D0%BD%D0%BE%D0%B9_%D1%86%D0%B5%D0%BF%D0%B8
        * @param {Array} contours: {Array} points, {bool} inner, {int} label
        * @param {float} simplify tolerant
        * @param {int} simplify count: min number of points when the contour is simplified
        * @return {Array} contours: {Array} points, {bool} inner, {int} label, {int} initialCount
        */
    lib.simplifyContours = function(contours, simplifyTolerant, simplifyCount) {
        var lenContours = contours.length,
            result = [],
            i, j, k, c, points, len, resPoints, lst, stack, ids,
            maxd, maxi, dist, r1, r2, r12, dx, dy, pi, pf, pl;

        // walk through all contours 
        for (j = 0; j < lenContours; j++) {
            c = contours[j];
            points = c.points;
            len = c.points.length;

            if (len < simplifyCount) { // contour isn't simplified
                resPoints = [];
                for (k = 0; k < len; k++) {
                    resPoints.push({ x: points[k].x, y: points[k].y });
                }
                result.push({ inner: c.inner, label: c.label, points: resPoints, initialCount: len });
                continue;
            }

            lst = [0, len - 1]; // always add first and last points
            stack = [{ first: 0, last: len - 1 }]; // first processed edge

            do {
                ids = stack.shift();
                if (ids.last <= ids.first + 1) // no intermediate points
                {
                    continue;
                }

                maxd = -1.0; // max distance from point to current edge
                maxi = ids.first; // index of maximally distant point

                for (i = ids.first + 1; i < ids.last; i++) // bypass intermediate points in edge
                {
                    // calc the distance from current point to edge
                    pi = points[i];
                    pf = points[ids.first];
                    pl = points[ids.last];
                    dx = pi.x - pf.x;
                    dy = pi.y - pf.y;
                    r1 = Math.sqrt(dx * dx + dy * dy);
                    dx = pi.x - pl.x;
                    dy = pi.y - pl.y;
                    r2 = Math.sqrt(dx * dx + dy * dy);
                    dx = pf.x - pl.x;
                    dy = pf.y - pl.y;
                    r12 = Math.sqrt(dx * dx + dy * dy);
                    if (r1 >= Math.sqrt(r2 * r2 + r12 * r12)) dist = r2;
                    else if (r2 >= Math.sqrt(r1 * r1 + r12 * r12)) dist = r1;
                    else dist = Math.abs((dy * pi.x - dx * pi.y + pf.x * pl.y - pl.x * pf.y) / r12);

                    if (dist > maxd) {
                        maxi = i; // save the index of maximally distant point
                        maxd = dist;
                    }
                }

                if (maxd > simplifyTolerant) // if the max "deviation" is larger than allowed then...
                {
                    lst.push(maxi); // add index to the simplified list
                    stack.push({ first: ids.first, last: maxi }); // add the left part for processing
                    stack.push({ first: maxi, last: ids.last }); // add the right part for processing
                }

            } while (stack.length > 0);

            resPoints = [];
            len = lst.length;
            lst.sort(function(a, b) { return a - b; }); // restore index order
            for (k = 0; k < len; k++) {
                resPoints.push({ x: points[lst[k]].x, y: points[lst[k]].y }); // add result points to the correct order
            }
            result.push({ inner: c.inner, label: c.label, points: resPoints, initialCount: c.points.length });
        }

        return result;
    };
    

    return lib;
};

