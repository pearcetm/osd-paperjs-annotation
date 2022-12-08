//requires paper.js
//expects annotations in the format provided by the DSA API method /annotation/item/{id}
//--this means an array of objects
//
//Events: raises DSA2Paper events on the OpenSeadragon viewer. Event data contains an "eventName" field.
// - 

function DSA2Paper(openSeadragonViewer){
    var _this = this;
    _this.currentZoom = 1;
    _this.totalOpacity = 1;
    _this.fillOpacity = 1;
    _this.selectionModeOpacityMultiplier=0.25;
    _this.selectionModeEnabled=false;
    _this.viewer = openSeadragonViewer;
    _this.overlay = _this.viewer.paperjsOverlay({scale:_this.viewer.tileSources.width});
    _this.canvas = _this.overlay._paperCanvas;
    _this.tools = toolSetup();
    paper.Path.prototype.toCompoundPath = toCompoundPath;
    paper.CompoundPath.prototype.toCompoundPath=toCompoundPath;    
    
    let ps = _this.overlay._paperScope;
    window.ps=ps;
    window._canvas = _this.canvas;
    _this.canvas.addClass=function(c){
        // $(this.element).addClass(c);
        this.element.classList.add(c);
        return this.element;
    }
    _this.canvas.removeClass=function(c){
        this.element.classList.remove(c);
        return this.element;
        // $(this.element).removeClass(c);
    }

    _this.viewer.addHandler('resize',function(){_this.overlay.resize();});
    _this.viewer.addHandler('open',handleRescale);
    _this.viewer.addHandler('AnnotationUI',AnnotationUIHandlers);
    ps.view.on('zoom-changed',handleRescale)

    
    function AnnotationUIHandlers(d){
        let handlers={
            'total-opacity-changed':setTotalOpacity,
            'fill-opacity-changed':setFillOpacity,
        }
        if(handlers[d.eventName]) handlers[d.eventName](d);
    }
    const api = _this.api = {
        createAnnotationLayer:function(){
            let layer= new paper.Layer();
            layer.isAnnotationLayer=true;
            layer.name='AnnotationLayer'
            let group= new paper.Group();
            group.name = 'elements';
            layer.addChild(group);
            return group;
        },
        makeObject:makeObject,
        useTool:function(toolname,activate=true){
            let tool = _this.tools[toolname];
            if(!tool){
                console.log(`WARNING: ${toolname} is not a currently installed tool.`)
            }
            activate ? tool.activate() : tool.deactivate();
        },
        deactivateAll: function(){
            ps.project.layers.forEach(function(l){l.opacity = 1;l.selectable=false;})
        },
        activateAnnotation: function(annotation){
            let opacity = _this.selectionModeOpacityMultiplier;
            ps.project.layers.filter(function(l){return l.isAnnotationLayer}).forEach(function(l){l.opacity = opacity;l.selectable=false;})
            annotation._overlay.layer.opacity = 1;
            annotation._overlay.layer.selectable = true;
            annotation._overlay.layer.activate();
        },
        setGlobalVisibility: function(visible=false){
            ps.view._element.setAttribute('style','visibility:'+(visible?'visible;':'hidden;'));
        },
        polyErase:function(e){
            _this.tools.polygon.setEraseMode(e);
        },
        finishPolygon: function(){
            _this.tools.polygon.finish();
            _this.tools.selection.activate();
        },
        finishBrush: function(){
            _this.tools.brush.finish();
            _this.tools.selection.activate();
        },
        setBrushRadius: function(r){
            _this.tools.brush.setRadius(r);
        },
        setBrushMode: function(erase){
            _this.tools.brush.setEraseMode(erase);
        },
        finishWand: function(){
            _this.tools.wand.finish();
            _this.tools.selection.activate();
        },
        setWandErase: function(b){
            _this.tools.wand.setEraseMode(b);
        },
        setWandFlood: function(b){
            _this.tools.wand.setFloodMode(b);
        },
        setWandReplace: function(b){
            _this.tools.wand.setReplaceMode(b);
        },
        wandApply:function(){
            _this.tools.wand.applyChanges();
        },
        setWandThreshold: function(t){
            _this.tools.wand.setThreshold(t);
        },
        wandUpdate:function(){
            _this.tools.wand.updatePolygon();
        },
        setFreedrawRadius: function(r){
            _this.tools.freedraw.setRadius(r);
        },
        finishFreedraw: function(){
            _this.tools.freedraw.finish();
            _this.tools.selection.activate();
        },
        setFillColor: function(rgb){
            _this.tools.style.setFillColor(rgb);
        },
        setStrokeColor: function(rgb){
            _this.tools.style.setStrokeColor(rgb);
        },
        setStrokeWidth: function(sw){
            _this.tools.style.setStrokeWidth(sw);
        },
        pickColor:function(){
            _this.tools.style.pickColor();
        },
        getAverageColor:function(){
            _this.tools.style.getAverageColor();
        },
        finishStyle:function(){
            _this.tools.style.deactivate(true);
            _this.tools.selection.activate();
        }
    }
    
    function setFillOpacity(d){
        let opacity = _this.fillOpacity = d.opacity;
        let elements = allElements();
        elements.forEach(function(el){
            el.fillColor.alpha = opacity;
        });
    }
    function setTotalOpacity(d){
        let opacity = _this.totalOpacity = d.opacity;
        let elements = allElements();
        elements.forEach(function(el){
            let overallOpacity = opacity * (_this.selectionModeEnabled ? _this.selectionModeOpacityMultiplier:1);
            el.opacity=overallOpacity;
        });
    }
    function allElements(){
        return ps.project.getItems({match:function(i){return [paper.Shape,paper.CompoundPath].includes(i.constructor)&&i.layer.isAnnotationLayer}})
    }
    
    function makeObject(blueprint){
        if(factory.hasOwnProperty(blueprint.type)===false) {
            console.log(`Warning! No method defined for type ${blueprint.type}`);
        }
        var obj = factory[blueprint.type](blueprint);
        return obj;
    }

    var factory = {
        polyline:makePolyline,
        freedraw:makeFreedrawing,
        rectangle:makeRectangle,
        point:makePoint,
        new:makeNewElement,
    }

    
    

    function toolSetup(){
        let toolLayer=new paper.Layer();
        toolLayer.isAnnotationLayer=false;
        toolLayer.name = 'toolLayer';
        let tools = {
            selection:new SelectionTool(),
            rectangle:new RectangleTool(),
            point: new PointTool(),
            polygon: new PolygonTool(),
            brush: new BrushTool(toolLayer),
            wand: new WandTool(toolLayer),
            freedraw : new FreedrawTool(toolLayer),
            style: new StyleTool(toolLayer),
        }
        Object.keys(tools).forEach(function(toolname){
            let tool = tools[toolname];
            tool._tool._toolObject=tool;
            tool.activate = function(){
                ps.tool._toolObject.deactivate(true);
                this._tool.activate();
                this.onActivate && this.onActivate();
                broadcast('tool-changed',{tool:toolname});
            }
            tool.deactivate = function(finishToolAction){
                this.onDeactivate && this.onDeactivate(finishToolAction);
            }
        })
        return tools;
    }

    function SelectionTool(){
        let tool = this._tool = new paper.Tool();
        let layer, item;
        this.onActivate=function(){ _this.viewer.addHandler('canvas-click',onMouseDown) };        
        this.onDeactivate=function(){
            _this.viewer.removeHandler('canvas-click',onMouseDown);
            ps.view.removeClass('selectable-layer')
        };

        tool.onMouseMove=function(ev){
            if(ev.item){
                if(item != ev.item) (ev.item.emit('selection:mouseenter')||true) //&& ev.item.layer.selectable && _this.viewer.disableMouseHandling();
                if(layer != ev.item.layer) ev.item.layer.emit('selection:mouseenter');
                item = ev.item;
                layer = item.layer;
                layer.selectable ? ps.view.addClass('selectable-layer') : ps.view.removeClass('selectable-layer');
            }
            else{
                item && (item.emit('selection:mouseleave',ev)||true) //&& item.layer.selectable && _this.viewer.enableMouseHandling();
                layer && layer.emit('selection:mouseleave',ev);
                ps.view.removeClass('selectable-layer')
                item = layer = null;
            }          
        }
        
        function onMouseDown(ev){
            //console.log('onMouseDown',ev)
            let coords = _this.viewer.viewport.viewerElementToImageCoordinates(ev.position);            
            let hitResult = ps.project.hitTest(coords,{fill:true,stroke:true,segments:true,tolerance:(5/_this.currentZoom)})
            if(!hitResult) return;
            //console.log(hitResult)
            if(hitResult.item.layer.selectable && hitResult.item.select && !hitResult.item.selected){
                hitResult.item.select();
                console.log('Selecting',hitResult.item)
            }
        }
        tool.onKeyUp=function(ev){
            //console.log(`Key up on ${ev.key} key`)
            if(ev.key=='escape'){
                let item=findSelectedItem();
                item && item.deselect();
            }
        }
    }
    function RectangleTool(){
        let tool = this._tool = new paper.Tool();
        this.onActivate = function(){_this.viewer.disableMouseHandling()};
        this.onDeactivate = function(){_this.viewer.enableMouseHandling()};
        let start, end, rect, item;
        
        tool.onMouseDown=function(ev){
            item=findNewItem();
            if(!item) return;
            start = ev.point;  
            let blueprint=item.instructions;
            blueprint.type='rectangle';
            blueprint.center=[ev.point.x,ev.point.y];
            blueprint.width=0;
            blueprint.height=0;
            rect = makeObject(blueprint)
            item.replace(rect);
            item=null;
        }
        tool.onMouseMove=function(ev){
            if(!rect) return;
            end=ev.point;
            let r=new paper.Rectangle(start,end);
            // rect.set({size:[r.width,r.height],position:r.center});
            rect.set({segments:[r.topLeft, r.topRight, r.bottomRight, r.bottomLeft]})
        }
        tool.onMouseUp=function(ev){
            end=ev.point;
            rect.select && rect.select();
            _this.tools.selection.activate();
            start=end=item=rect=null;
        }
    }
    function PointTool(){
        let tool = this._tool = new paper.Tool();
        this.onActivate = function(){_this.viewer.disableMouseHandling()};
        this.onDeactivate = function(){_this.viewer.enableMouseHandling()};
        tool.onMouseDown=function(ev){
            item=findNewItem();
            if(!item) return;
            //console.log(item);
            let blueprint=item.instructions;
            blueprint.type='point';
            blueprint.center=[ev.point.x,ev.point.y];
            let pt = makeObject(blueprint);
            item.replace(pt);
            item=null;
            pt.select && pt.select();
            _this.tools.selection.activate();

        }
    }
    function StyleTool(toolLayer){
        let self =  this;
        let tool = this._tool = new paper.Tool();
        let shiftPressed, mode;
        let item;
        let cursor = makeCursor();
        toolLayer.addChild(cursor);
        

        function makeCursor(){
            let cursor = new paper.Group({visible:false});
            let s = 12;

            for(var y=-4;y<5;y++){
                for(var x=-4;x<5;x++){
                    let r = new paper.Shape.Rectangle({point:[x*s,y*s],size:[s,s],strokeWidth:0.5,strokeColor:'white',fillColor:'white',
                    rescale:{position:[x*s,y*s],size:[s,s],strokeWidth:0.5}});
                    cursor.addChild(r);
                }
            }
            //add darker thicker border for central "selected" spot
            var x = 0, y = 0;
            let r = new paper.Shape.Rectangle({point:[x*s,y*s],size:[s,s],strokeWidth:1,strokeColor:'black',fillColor:null,
            rescale:{position:[x*s,y*s],size:[s,s],strokeWidth:1}});
            cursor.addChild(r);

            return cursor;
        }

        this.onActivate = function(){
            _this.viewer.disableMouseHandling();
            item=findSelectedItem();
            broadcast('set-style-info',{
                fillColor:item.fillColor && item.fillColor.toCSS(),
                strokeColor:item.strokeColor && item.strokeColor.toCSS(),
                strokeWidth:item.rescale && item.rescale.strokeWidth,
            })
            if(mode=='colorPicker') ps.view.addClass('tool-action').setAttribute('data-tool-action','colorpicker');
        };
        this.onDeactivate = function(finished){
            _this.viewer.enableMouseHandling()
            ps.view.removeClass('tool-action').setAttribute('data-tool-action','');
            if(finished){
                cancelColorpicker();
            }
        };

        this.setFillColor = function(rgb){
            item && (item.fillColor.red=rgb.r/255, item.fillColor.green=rgb.g/255, item.fillColor.blue=rgb.b/255);
            this.broadcastStyle();
        };
        this.setStrokeColor = function(rgb){
            item && (item.strokeColor.red=rgb.r/255, item.strokeColor.green=rgb.g/255, item.strokeColor.blue=rgb.b/255);
            this.broadcastStyle();
        };
        this.setStrokeWidth = function(sw){
            item && (item.rescale.strokeWidth = sw, item.strokeWidth = sw/_this.currentZoom);
        }
        this.broadcastStyle = function(){
            item && broadcast('set-style-info',{
                fillColor:item.fillColor && item.fillColor.toCSS(),
                strokeColor:item.strokeColor && item.strokeColor.toCSS(),
                strokeWidth:item.rescale && item.rescale.strokeWidth,
            })
        }
        this.getAverageColor = function(){
            let imgrect=_this.viewer.viewport.viewportToViewerElementRectangle(_this.viewer.world.getItemAt(0).getBounds());
            let viewrect=_this.viewer.viewport.viewportToViewerElementRectangle(_this.viewer.viewport.getBounds());
            let x = Math.floor(Math.max(imgrect.x, viewrect.x))-1;
            let y = Math.floor(Math.max(imgrect.y, viewrect.y))-1;
            let w = Math.ceil(Math.min(viewrect.x+viewrect.width, imgrect.x+imgrect.width))-x+2;
            let h = Math.ceil(Math.min(viewrect.y+viewrect.height, imgrect.y+imgrect.height))-y+2;
            
            // let imdata = _this.viewer.drawer.canvas.getContext('2d').getImageData(x,y,w,h);
            let newcanvas = $('<canvas>').attr({width:w,height:h})[0];
            newcanvas.getContext('2d').drawImage(_this.viewer.drawer.canvas,x,y,w,h,0,0,w,h);
            let dataurl = newcanvas.toDataURL();
            
            $('<img>',{style:'position:absolute;top:60px;left:10px;'}).appendTo('body').on('load',function(){
                let raster = new paper.Raster(this);
                let rasterSize=new paper.Size(raster.width,raster.height);
                raster.position = ps.view.viewToProject(new paper.Point(x,y)).add(rasterSize.divide(2)); 
                raster.scale(1/_this.currentZoom,raster.bounds.topLeft)
                // raster.selected=true;
                let color = raster.getAverageColor(item);
                let c = color ? color.toCSS() : 'rgb(0, 0, 0)';
                if(!color) alert('Error: The item must be visible on the screen to pick the average color of visible pixels. Please navigate and retry.')
                broadcast('color-picked',{color:c});
                raster.remove();
            }).attr('src',dataurl)
            // createImageBitmap(imdata).then(function(imbitmap){
            //     let raster = new paper.Raster(imbitmap,ps.view.viewToProject(new paper.Point(x,y).add(new paper.Point(w/2, h/2))));
            //     let color = raster.getAverageColor(item);
            //     broadcast('color-picked',{color:color.toCSS()});
            //     // raster.remove();
            // })
            
        };
        this.pickColor = function(){
            mode = 'colorPicker';
            cursor.visible=true;
            cursor.addTo(ps.project.activeLayer);
            ps.view.addClass('tool-action').setAttribute('data-tool-action','colorpicker');
        }
        tool.onKeyDown=function(ev){
            // console.log(`Key down on ${ev.key} key`)
            if(!shiftPressed && ev.key==='shift'){
                self.onDeactivate();//enable OpenSeadragon event handling for navigation
            }
        }
        tool.onKeyUp=function(ev){
            // console.log(`Key up on ${ev.key} key`)
            if(ev.key=='shift'){
                self.onActivate();//start capturing mouse/keyboard events again
            }
            if(ev.key=='esc'){
                cancelColorpicker();
            }
        }
        tool.onMouseMove=function(ev){            
            if(mode=='colorPicker'){
                cursor.position=ev.point;
                let o = _this.viewer.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(ev.point.x,ev.point.y));
                let x = Math.round(o.x)-4;
                let y = Math.round(o.y)-4;
                let w = 9;
                let h = 9;                
                let imdata = _this.viewer.drawer.canvas.getContext('2d').getImageData(x,y,w,h);
                for(var i=0,p=0; i<imdata.data.length; i+=4, p+=1){
                    cursor.children[p].fillColor.red = imdata.data[i]/255;
                    cursor.children[p].fillColor.green = imdata.data[i+1]/255;
                    cursor.children[p].fillColor.blue = imdata.data[i+2]/255;
                }
                cursor.selectedColor = cursor.children[40].fillColor;
                                
            }
        }
        tool.onMouseUp=function(ev){
            if(mode=='colorPicker'){
                broadcast('color-picked',{color:cursor.selectedColor.toCSS()});
                cancelColorpicker();
            }
        }
        function cancelColorpicker(){
            cursor.addTo(toolLayer);
            mode = null;
            cursor.visible = false;            
            ps.view.removeClass('tool-action').setAttribute('data-tool-action','');
        }
    }
    function PolygonTool(){
        let self = this;
        let tool = this._tool = new paper.Tool();        
        let item, test, draggingSegment, drawing, mode, eraseMode=false;
        let shiftPressed=false, ePressed=false;
        this.onActivate = function(){
            _this.viewer.disableMouseHandling(); 
            tool.minDistance=4/_this.currentZoom;
            tool.maxDistance=20/_this.currentZoom;
            item = item || findSelectedPolygon();
            if(item && item.closed){
                mode='editing';
            }
            else{
                mode='creating';
            }

            console.log(mode)
        };
        this.onDeactivate = function(finished){
            _this.viewer.enableMouseHandling();
            if(finished){
                this.finish();
            }
        };
        this.finish = function(){
            if(item) item.closed=true;
            item=draggingSegment=drawing=test=null;
            this.setEraseMode(false);
            ps.view.removeClass('tool-action').setAttribute('data-tool-action','');              
        }
        
        this.setEraseMode=function(erase){
            eraseMode=erase;
            item && (item.selectedColor = erase ? 'red' : null);
        }
               
        tool.onMouseDown=function(ev){
            draggingSegment=null;
            
            if(mode=='creating' && !item){
                item=findNewItem();
                if(item&&item.instructions){
                    let blueprint=item.instructions;
                    blueprint.type='polyline';
                    blueprint.closed=false;
                    blueprint.points=[[ev.point.x, ev.point.y,0]];
                    let newItem = makeObject(blueprint);
                    item.replace(newItem);
                    item = newItem;
                    item.selected=true;
                    drawing = {path:item.firstChild, index: 1};
                }             
            }
            else{
                let hitResult = item.hitTest(ev.point,{fill:false,stroke:true,segments:true,tolerance:(5/_this.currentZoom)})
                if(hitResult){
                    //if erasing and hitResult is a segment, hitResult.segment.remove()
                    if(hitResult.type=='segment' && eraseMode){
                        hitResult.segment.remove();
                    }
                    //if hitResult is a segment and NOT erasing, save reference to hitResult.segment for dragging it
                    else if(hitResult.type=='segment'){
                        draggingSegment = hitResult.segment;
                    }
                    //if hitResult is a stroke, add a point:
                    else if(hitResult.type=='stroke'){
                        let insertIndex = hitResult.location.index +1;
                        let ns = hitResult.item.insert(insertIndex, ev.point);
                        console.log('inserting at index',insertIndex, 'ns',ns)
                        drawing = {path:hitResult.item, index:insertIndex+1};
                    }
                }
                else if(mode=='creating'){
                    let segment = item.firstChild.add(ev.point);
                    drawing = {path:item.firstChild, index: segment.index + 1};
                }
            }
            
        }
        tool.onMouseDrag=function(ev){
            if(drawing){
                drawing.path.insert(drawing.index,ev.point);
                drawing.index += 1;
            }
            else if (draggingSegment){
                draggingSegment.point = draggingSegment.point.add(ev.delta);
            }
        }
        tool.onMouseMove=function(ev){
            let hitResult = item && item.hitTest(ev.point,{fill:false,stroke:true,segments:true,tolerance:(5/_this.currentZoom)})
            if(hitResult){
                let action = hitResult.type + (eraseMode ? '-erase' : '');
                ps.view.addClass('tool-action').setAttribute('data-tool-action',action);
            }
            else{
                ps.view.removeClass('tool-action').setAttribute('data-tool-action','');
            }  
        }
        tool.onMouseUp=function(ev){
            draggingSegment=null;
            drawing = false;
        }

        tool.onKeyDown=function(ev){
            // console.log(`Key down on ${ev.key} key`)
            if(!shiftPressed && ev.key==='shift'){
                self.onDeactivate();//enable OpenSeadragon event handling for navigation
            }
            if(ev.key=='e'){
                if(eraseMode===false) broadcast('poly-erase',{erase:!eraseMode});
                else if(eraseMode===true) eraseMode='keyhold';
            }
        }
        tool.onKeyUp=function(ev){
            // console.log(`Key up on ${ev.key} key`)
            if(ev.key=='shift'){
                self.onActivate();//start capturing mouse/keyboard events again
            }
            if(ev.key=='e' && eraseMode=='keyhold') broadcast('poly-erase',{erase:false});
        }
    }

    function BrushTool(toolLayer){
        let self = this;
        let tool = this._tool = new paper.Tool();        
        let item, dragging;
        let shiftPressed=false;
        let eraseMode = eraseKeyPressed=false;
        let drawColor = new paper.Color('green');
        let eraseColor= new paper.Color('red');
        drawColor.alpha=0.5;
        eraseColor.alpha=0.5;

        let radius = 0;
        let cursor=new paper.Shape.Circle(new paper.Point(0,0),radius);
        cursor.set({
            strokeWidth:1,
            strokeColor:'black',
            fillColor:drawColor,
            opacity:1,
        });
        let pathGroup = new paper.Group([new paper.Path(), new paper.Path()]);
        toolLayer.addChild(pathGroup);
        toolLayer.addChild(cursor);

        this.onActivate = function(){
            _this.viewer.disableMouseHandling();
            toolLayer.bringToFront();
            cursor.radius = radius/_this.currentZoom;
            cursor.strokeWidth=1/_this.currentZoom;
            tool.minDistance=4/_this.currentZoom;
            tool.maxDistance=10/_this.currentZoom;
            _this.canvas.element.addEventListener('wheel',this._tool.onMouseWheel); 
        };
        this.onDeactivate = function(finished){
            _this.viewer.enableMouseHandling();
            toolLayer.sendToBack();
            cursor.radius = 0;
            _this.canvas.element.removeEventListener('wheel',this._tool.onMouseWheel);
            if(finished){
                this.finish();
            } 
        };
        this.finish = function(){
            item=dragging=null;

        }
        this.setRadius=function(r){
            radius = r;
            cursor.radius=r/_this.currentZoom;
        }
        this.setEraseMode=function(erase){
            eraseMode=erase;
            cursor.fillColor= erase ? eraseColor : drawColor;
        }
        
        function modifyArea(){
            
            let path = pathGroup.lastChild;
            // path.simplify();
            let shape;
            if(path.segments.length>1){                
                shape = PaperOffset.offsetStroke(path,path.radius,{join:'round',cap:'round',insert:true})
                // console.log(shape)                
            }
            else{
                shape = new paper.Path.Circle({center: path.firstSegment.point, radius: path.radius });
            }

            shape.strokeWidth = 1/_this.currentZoom;
            shape.strokeColor = 'black'
            shape.fillColor='yellow'

            path.visible=false;

            if(eraseMode){
                result = item.subtract(shape,{insert:false});
            }
            else{
                //result = intersect(poly,item) && item.unite(poly,{insert:false});  
                result = item.unite(shape,{insert:false});              
            }
            if(result){
                result=result.toCompoundPath();
                item.replace(result)
                item=result;
                console.log('Item modified',item);             
            }
            shape.remove();
        }        
        tool.onMouseDown=function(ev){
            ev.preventDefault();
            ev.stopPropagation();
            
            if(!item){
                item = findNewItem() || findSelectedPolygon();
                if(item&&item.instructions){
                    let blueprint=item.instructions;
                    blueprint.type='polyline';
                    blueprint.closed=true;
                    //blueprint.points=[[cursor.position.x, cursor.position.y, 0]];
                    blueprint.points=[]
                    let newItem = makeObject(blueprint);
                    item.replace(newItem);
                    item = newItem;
                    item.selected=true;
                }
            }
            
            dragging=true;
            cursor.position=ev.point;

            let path = new paper.Path([ev.point]);
            path.mode = eraseMode ? 'erase' : 'draw';
            path.radius = radius/_this.currentZoom;
            // path.strokeWidth = radius/_this.currentZoom;
            // path.strokeColor = 'black';
            // path.opacity = 0.3;
            // let shape = new paper.Path.RegularPolygon(path.segments[0].point,90,cursor.radius);
            // pathGroup.firstChild.replaceWith(shape);
            pathGroup.lastChild.replaceWith(path);
            pathGroup.lastChild.set({strokeWidth:cursor.radius*2,fillColor:null,strokeCap:'round'});
            if(path.mode=='erase'){
                pathGroup.firstChild.fillColor='red';
                pathGroup.lastChild.strokeColor='red';                
                // pathGroup.lastChild.fillColor=null;
            }
            else{
                pathGroup.firstChild.fillColor='green';
                pathGroup.lastChild.strokeColor='green';
                // pathGroup.lastChild.fillColor=null;
            }
        }
        tool.onMouseMove=function(ev){
            cursor.position=ev.point;
            if(dragging && item){
                //modifyArea();
                //item.add(ev.point);
                pathGroup.lastChild.add(ev.point);
                pathGroup.lastChild.smooth({ type: 'continuous' })
                // pathGroup.lastChild.smooth();
                // pathGroup.lastChild.flatten(1/_this.currentZoom);
                // previewPath();
            }
        }
        tool.onMouseUp=function(ev){
            dragging=false;
            //if((item.segments.slice(-1)[0]-ev.point).length>0) item.add(ev.point);
            modifyArea();
        }
        tool.onMouseWheel = function(ev){
            console.log('Wheel event',ev);
            ev.preventDefault();
            ev.stopPropagation();
            if(ev.deltaY==0) return;//ignore lateral "scrolls"
            broadcast('brush-radius',{larger:ev.deltaY > 0});
        }

        tool.onKeyDown=function(ev){
            // console.log(`Key down on ${ev.key} key`)
            if(!shiftPressed && ev.key==='shift'){
                self.onDeactivate();//enable OpenSeadragon event handling for navigation
            }
        }
        tool.onKeyUp=function(ev){
            // console.log(`Key up on ${ev.key} key`)
            if(ev.key=='shift'){
                self.onActivate();//start capturing mouse/keyboard events again
            }
            if(ev.key=='e'){
                broadcast('brush-erase',{erase:!eraseMode})
            }
        }
    }
    function FreedrawTool(toolLayer){
        let self = this;
        let tool = this._tool = new paper.Tool();        
        let item, dragging;
        let shiftPressed=false;
        let eraseMode = eraseKeyPressed=false;
        let drawColor = new paper.Color('green');
        let eraseColor= new paper.Color('red');
        drawColor.alpha=0.5;
        eraseColor.alpha=0.5;

        let radius = 0;
        let cursor=new paper.Shape.Circle(new paper.Point(0,0),radius);
        cursor.set({
            strokeWidth:1,
            strokeColor:'black',
            fillColor:drawColor,
            opacity:1,
        });
        let path;
        toolLayer.addChild(cursor);

        this.onActivate = function(){
            _this.viewer.disableMouseHandling();
            toolLayer.bringToFront();
            cursor.radius = radius/_this.currentZoom;
            cursor.strokeWidth=1/_this.currentZoom;
            tool.minDistance=4/_this.currentZoom;
            tool.maxDistance=10/_this.currentZoom;
            _this.canvas.element.addEventListener('wheel',this._tool.onMouseWheel); 
        };
        this.onDeactivate = function(finished){
            _this.viewer.enableMouseHandling();
            toolLayer.sendToBack();
            cursor.radius = 0;
            _this.canvas.element.removeEventListener('wheel',this._tool.onMouseWheel);
            if(finished){
                this.finish();
            } 
        };
        this.finish = function(){
            item=dragging=null;
        }
        this.setRadius=function(r){
            radius = r;
            cursor.radius=r/_this.currentZoom;
        }
        this.setEraseMode=function(erase){
            eraseMode=erase;
            cursor.fillColor= erase ? eraseColor : drawColor;
        }
        
        function modifyItem(){
            if(eraseMode){
                let shape;
                if(path.segments.length>1){                
                    shape = PaperOffset.offsetStroke(path,path.radius,{join:'round',cap:'round',insert:true})
                    // console.log(shape)                
                }
                else{
                    shape = new paper.Path.Circle({center: path.firstSegment.point, radius: path.radius });
                }
                shape.strokeWidth = 1/_this.currentZoom;
                shape.strokeColor = 'black'
                shape.fillColor='yellow'

                let result = item.divide(shape,{insert:false});
                
                shape.remove();
                path.remove();
            }
            else{
                //result = intersect(poly,item) && item.unite(poly,{insert:false});  
                item.addChild(path);              
            }
                        
        }  
           
        tool.onMouseDown=function(ev){
            ev.preventDefault();
            ev.stopPropagation();
            
            if(!item){
                item = findNewItem() || findSelectedPolygon();
                if(item&&item.instructions){
                    let blueprint=item.instructions;
                    blueprint.type='freedraw';
                    blueprint.children=[];
                    let newItem = makeObject(blueprint);
                    item.replace(newItem);
                    item = newItem;
                    item.selected=true;
                }
            }
            
            dragging=true;
            cursor.position=ev.point;

            // path = new paper.Path([ev.point]);
            path = makePolyline({points:[[ev.point.x,ev.point.y,0]],closed:false})
            path.radius = radius/_this.currentZoom;
            
            path.set({strokeWidth:cursor.radius*2,fillColor:null,strokeCap:'round'});
            if(eraseMode){
                path.strokeColor='red';                
                // pathGroup.lastChild.fillColor=null;
            }
            else{
                path.strokeColor='green';
                // pathGroup.lastChild.fillColor=null;
            }
        }
        tool.onMouseMove=function(ev){
            cursor.position=ev.point;
            if(dragging && item){
                path.lastChild.add(ev.point);
                path.lastChild.smooth({ type: 'continuous' })
            }
        }
        tool.onMouseUp=function(ev){
            dragging=false;
            modifyItem();
        }
        tool.onMouseWheel = function(ev){
            console.log('Wheel event',ev);
            ev.preventDefault();
            ev.stopPropagation();
            if(ev.deltaY==0) return;//ignore lateral "scrolls"
            broadcast('brush-radius',{larger:ev.deltaY > 0});
        }

        tool.onKeyDown=function(ev){
            // console.log(`Key down on ${ev.key} key`)
            if(!shiftPressed && ev.key==='shift'){
                self.onDeactivate();//enable OpenSeadragon event handling for navigation
            }
        }
        tool.onKeyUp=function(ev){
            // console.log(`Key up on ${ev.key} key`)
            if(ev.key=='shift'){
                self.onActivate();//start capturing mouse/keyboard events again
         
            }
            if(ev.key=='e'){
                broadcast('brush-erase',{erase:!eraseMode})
            }
        }
    }

    function WandTool(toolLayer){
        let self = this;
        let tool = this._tool = new paper.Tool();        
        let item, start, dragging, visibleArea, viewarea, preview;
        let dragStartMask, currentMask, eraseMask, initMask;
        let shiftPressed=false;
        let eraseMode = replaceMode = false;
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
        broadcast('wand-threshold',{threshold:threshold});

        let temp;

        // let imgPreview, imgPreview2, imgPreview3;
        
        this.onActivate = function(){
            _this.viewer.disableMouseHandling();
            toolLayer.bringToFront();            
            // imgPreview=$('<img>',{style:'position:fixed;top:40px;left:30px;max-height:100px;border:thin white solid;'}).appendTo('body');
            // imgPreview2=$('<img>',{style:'position:fixed;top:140px;left:30px;max-height:100px;border:thin white solid;'}).appendTo('body');
            // imgPreview3=$('<img>',{style:'position:fixed;top:240px;left:30px;max-height:100px;border:thin white solid;'}).appendTo('body');
            // window.imgPreview=imgPreview;
            // window.imgPreview2=imgPreview2;
            // window.imgPreview3=imgPreview3;
            if(!item) {item=findSelectedPolygon(); console.log('item on activate',item)}
            getImageData();
            _this.canvas.element.addEventListener('wheel',this._tool.onMouseWheel);
            _this.viewer.addHandler('animation-finish',getImageData);            
        };
        this.onDeactivate = function(finished){
            _this.viewer.enableMouseHandling();
            toolLayer.sendToBack();
            _this.canvas.element.removeEventListener('wheel',this._tool.onMouseWheel);            
            _this.viewer.removeHandler('animation-finish',getImageData);
            im=null;
            // imgPreview.remove();
            // imgPreview2.remove();
            // imgPreview3.remove();  
            preview && preview.remove();
            if(finished){
                this.finish();
            }
        };
        this.finish = function(){
            // if(item) smoothAndSimplify(item);
            item=dragging=null;
            preview && preview.remove();
            dragStartMask=currentMask=eraseMask=initMask=null;      
        }
        this.setThreshold=function(t){
            threshold=parseInt(t);
        }
        this.setEraseMode=function(erase){
            eraseMode=erase;
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
                path.children = contours.map(function(c){
                    let pts = c.points.map(function(pt){
                        return ps.view.viewToProject(new paper.Point(pt).add(offset));
                    })
                    let path=new paper.Path(pts)
                    path.closed=true;
                    return path;
                }).filter(function(p){
                    //Use absolute area since inner (hole) paths will have negative area
                    if(Math.abs(p.area*_this.currentZoom*+_this.currentZoom) >= minPathArea){
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
            initItemIfNeeded();
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
            toUnite.scale(1/_this.viewer.drawer.canvas.pixelRatio, new paper.Point(0,0));
            // pos.divide(_this.viewer.drawer.canvas.pixelRatio);  
            dilated.scale(1/_this.viewer.drawer.canvas.pixelRatio), new paper.Point(0,0);
            // pos.divide(_this.viewer.drawer.canvas.pixelRatio);  

            let va = new paper.Path.Rectangle(viewarea.bounds.topLeft.add(new paper.Point(0.1,0.1)), viewarea.bounds.bottomRight.subtract(new paper.Point(0.1,0.1)))
            // let toErase = va.subtract(dilated,{insert:true});
            let toErase = fuzzyBoolOp(va,'subtract',dilated, viewarea); //<--- this needs to be tested!!! line above was working late night 10/12
            
            toUnite.set({strokeColor:'green',fillColor:'yellow'});
            toErase.set({strokeColor:'red',fillColor:'blue'});
            toUnite.fillColor.alpha=0.5;
            toErase.fillColor.alpha=0.5;
            
            
            item.selected=false;
            
            let n1 = fuzzyBoolOp(item,'subtract',toErase,viewarea)
            n1 = n1.toCompoundPath();
            console.log('n1 paths',n1.children)
            removeDuplicates(n1);
            let r = n1.set({fillColor:'magenta'}).rasterize({resolution:ps.view.resolution*_this.currentZoom, insert:false})
            // imgPreview2.attr('src',r.toDataURL());
            
            
            let newPath = fuzzyBoolOp(n1,'unite',toUnite,viewarea);
            
            newPath = newPath.toCompoundPath();
            console.log('toUnite paths',toUnite.children,toUnite.area)
            console.log('newPath paths',newPath.children,newPath.area)
            
            toUnite.remove();
            toErase.remove();
            dilated.remove();
            n1.remove();

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
            success =  newPath !== n1;
            if(!success){
                console.log('Oops! Bad unite!',n1,toUnite)
                newPath.replaceWith(item);
                newPath = item;
            }
            
            
            if(!temp) temp=0;
            temp++;
            
            item.replace(newPath);
            
            newPath.selected=true;
            newPath.name='replacment-'+temp;
            item = newPath;
            getImageData();
            
        };
        
        function fuzzyBoolOp(a,op,b,viewarea){
            let success=false;
            let tries=10;
            let output;
            while(!success && tries>0){
                output=a[op](b,{insert:false});
                console.log('here',success,tries)
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
                    
                    // if(!window.boolop) window.boolop=[];
                    // let d={op:op};
                    // let r = tst.set({fillColor:'magenta'}).rasterize({resolution:ps.view.resolution*_this.currentZoom, insert:false})
                    // d.tst= r.toDataURL();
                    // r = ref.set({fillColor:'yellow'}).rasterize({resolution:ps.view.resolution*_this.currentZoom, insert:false})
                    // d.ref=r.toDataURL();
                    // r = b.set({fillColor:'green'}).rasterize({resolution:ps.view.resolution*_this.currentZoom, insert:false})
                    // d.b=r.toDataURL();
                    // r = a.set({fillColor:'white'}).rasterize({resolution:ps.view.resolution*_this.currentZoom, insert:false})
                    // d.a=r.toDataURL();
                    // r = output.set({fillColor:'white'}).rasterize({resolution:ps.view.resolution*_this.currentZoom, insert:false})
                    // d.output=r.toDataURL();
                    // d.viewarea = viewarea;
                    // d.area_ratio=(testarea - refarea)/refarea;
                    // window.boolop.push(d);
                }
                else if(op=='subtract'){
                    let tst = viewarea.intersect(output,{insert:false});
                    let testarea=tst.area;
                    let orig = viewarea.intersect(a,{insert:false});
                    let origarea = orig.area;
                    let ref = viewarea.subtract(b,{insert:false});
                    let refarea = ref.area
                    console.log('testing subtract',testarea,origarea,refarea)
                    success =  (testarea <= origarea) && (testarea <= refarea);
                    // if(!window.boolop) window.boolop=[];
                    // let d={op:op};
                    // let r = tst.set({fillColor:'magenta'}).rasterize({resolution:ps.view.resolution*_this.currentZoom, insert:false})
                    // d.tst= r.toDataURL();
                    // r = ref.set({fillColor:'yellow'}).rasterize({resolution:ps.view.resolution*_this.currentZoom, insert:false})
                    // d.ref=r.toDataURL();
                    // r = orig.set({fillColor:'cyan'}).rasterize({resolution:ps.view.resolution*_this.currentZoom, insert:false})
                    // d.orig=r.toDataURL();
                    // r = b.set({fillColor:'green'}).rasterize({resolution:ps.view.resolution*_this.currentZoom, insert:false})
                    // d.b=r.toDataURL();
                    // r = output.set({fillColor:'white'}).rasterize({resolution:ps.view.resolution*_this.currentZoom, insert:false})
                    // d.output=r.toDataURL();
                    // d.viewarea = viewarea;
                    
                    // window.boolop.push(d);
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
            console.log(acc);
            // console.log('3: ',ps.project.activeLayer.children[0].style.fillColor)
            acc.remove.reverse().forEach(function(i){cp.removeChildren(i,i+1)});
        }
        function getImageData(){
            let imgrect=_this.viewer.viewport.viewportToViewerElementRectangle(_this.viewer.world.getItemAt(0).getBounds());
            let viewrect=_this.viewer.viewport.viewportToViewerElementRectangle(_this.viewer.viewport.getBounds());
            let x = (Math.floor(Math.max(imgrect.x, viewrect.x))-1);
            let y = (Math.floor(Math.max(imgrect.y, viewrect.y))-1);
            let w = (Math.ceil(Math.min(viewrect.x+viewrect.width, imgrect.x+imgrect.width))-x+2);
            let h = (Math.ceil(Math.min(viewrect.y+viewrect.height, imgrect.y+imgrect.height))-y+2);
            let r = _this.viewer.drawer.canvas.pixelRatio;
            visibleArea={
                x:x,
                y:y,
                width:w,
                height:h,
                data:_this.viewer.drawer.canvas.getContext('2d').getImageData(x*r,y*r,w*r,h*r),
            }
            console.log(_this.viewer.drawer.canvas.getContext('2d'))
            viewarea && viewarea.remove();
            viewarea = new paper.Path.Rectangle(ps.view.viewToProject(new paper.Point(x,y)),ps.view.viewToProject(new paper.Point(x+w,y+h)));                
            viewarea.fillColor='black';

            console.log(visibleArea)
            
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
                let r = mask.rasterize({resolution:ps.view.resolution*_this.currentZoom, insert:false});
                // imgPreview.attr('src',r.toDataURL());
                let id = r.getImageData();
                
                // initMask=currentMask=new ImageData(id.width, id.height);
                initMask = {
                    width:id.width,
                    height:id.height,
                    data:new Uint8ClampedArray(id.width*id.height)
                };
                currentMask = {
                    width:id.width,
                    height:id.height,
                    data:new Uint8ClampedArray(id.width*id.height)
                };
                for(var i =0, m=0; i<id.data.length; i+=4, m+=1){
                    initMask.data[m] = currentMask.data[m] = (id.data[i]+id.data[i+1]+id.data[i+2])==0 ? 1 : 0;
                }
                mask.remove();
                r.remove();
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
            let r = _this.viewer.drawer.canvas.pixelRatio
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
                if(eraseMode){
                    // console.log('Erase mode on')
                    
                    eraseMask = MagicWand.floodFill(i,Math.round(pt.x),Math.round(pt.y),threshold,null,false) || eraseMask;
                    currentMask = concatMasks(dragStartMask,eraseMask,true);
                    currentMask.bounds = eraseMask.bounds;
                }
                else{
                    // console.log('Erase mode off')
                    
                    currentMask = MagicWand.floodFill(i,Math.round(pt.x),Math.round(pt.y),threshold,null,false) || currentMask;
                    currentMask = concatMasks(currentMask,dragStartMask);
                }
            }
            else{
                // console.log('Flood mode off')
                if(eraseMode){
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
            let pos = ps.view.viewToProject(offset).add(rasterSize.divide(2));
            //Scale the preview and position to account for pixel ratio
            preview.scale(1/_this.viewer.drawer.canvas.pixelRatio);
            pos.divide(_this.viewer.drawer.canvas.pixelRatio);           
            
            toolLayer.addChild(preview);
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
            preview.scale(1/_this.currentZoom,preview.bounds.topLeft);
            //imgPreview.attr('src',preview.toDataURL());
        }
        
        
        function initItemIfNeeded(){
            if(!item){
                item = findNewItem() || findSelectedPolygon();
                console.log('Item:',item)
                if(item&&item.instructions){
                    let blueprint=item.instructions;
                    blueprint.type='polyline';
                    blueprint.closed=true;
                    blueprint.points=[];
                    let newItem = makeObject(blueprint);
                    item.replace(newItem);
                    item = newItem;
                    item.selected=true;
                }
                if(!initMask && !currentMask) getImageData();
            }
        }        
        tool.onMouseDown=function(ev){
            dragging=true;
            // initItemIfNeeded(); // do this only when applying the wand
            start = ev.point;
            startThreshold=threshold;
            dragStartMask = (replaceMode) ? initMask : currentMask;
            applyMagicWand(start);     
        }
        tool.onMouseMove=function(ev){
            if(dragging){//if(dragging && item){
                let delta = ev.point.subtract(start).multiply(_this.currentZoom);
                let s=Math.round((delta.x+delta.y*-1)/2);
                threshold=Math.min(Math.max(startThreshold+s, minThreshold), maxThreshold);
                if(Number.isNaN(threshold)){
                    console.log('wft nan??');
                }
                broadcast('wand-threshold',{threshold:threshold});
                applyMagicWand(start);
            }
        }
        tool.onMouseUp=function(ev){
            dragging=false;
        }
        
        tool.onKeyDown=function(ev){
            if(!shiftPressed && ev.key==='shift'){
                self.onDeactivate();//enable OpenSeadragon event handling for navigation
            }
        }
        tool.onKeyUp=function(ev){
            console.log(`Key up on ${ev.key} key`)
            if(ev.key=='shift'){
                self.onActivate();//start capturing mouse/keyboard events again
            }
            if(ev.key=='w'){
                broadcast('wand-add',{});
            }
            if(ev.key=='e'){
                broadcast('wand-erase',{});
            }
            if(ev.key=='r'){
                broadcast('wand-replace',{});
            }
            if(ev.key=='a'){
                broadcast('wand-apply',{});
            }
            if(ev.key=='f'){
                broadcast('wand-flood',{});
            }
        }
    }

    function concatMasks(a,b,erase) {
        if(!b) return a;
        let result = new Uint8Array(a.data.length);
        if(erase){
            for(i=0;i<a.data.length;i+=1){
                result[i]=(a.data[i]&&!b.data[i]) ? 1 : 0;
            }
        }
        else{
            for(i=0;i<a.data.length;i+=1){
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
    
    function toCompoundPath(){
        if(this.constructor !== paper.CompoundPath){
            let np = new paper.CompoundPath({children:[this],fillRule:'evenodd'});
            np.selected=this.selected;
            this.selected=false;
            return np;
        }
        return this;
    }
    function handleRescale(ev){
        // console.log('on zoom-changed',ev)
        _this.currentZoom = _this.canvas.getZoom();//console.log('onZoom, _this.currentZoom is now ',1/_this.currentZoom,ev.zoom)
        ps.project.getItems({match:function(o){return o.rescale}}).forEach(function(item){
            Object.keys(item.rescale).forEach(function(prop){
                item[prop] = Array.isArray(item.rescale[prop]) ? item.rescale[prop].map(function(i){return i/_this.currentZoom}) : item.rescale[prop]/_this.currentZoom;
            })
        });
    }
    function findNewItem(){
        return ps.project.getItems({match:function(i){return i.instructions}})[0];
    }
    function findSelectedPolygon(){
        return ps.project.getItems({selected:true,class:paper.CompoundPath})[0];
    }
    function findSelectedItem(){
        return ps.project.getItems({selected:true,match:function(i){return [paper.CompoundPath,paper.Shape,paper.Path].includes(i.constructor)}})[0];
    }
    function makePolyline(e){
        // if(e.closed) return makePolygon(e);
        // else(console.log('Non-closed polyline not implemented'))
        return makePolygon(e,e.closed);
    }    
    function makePolygon(e,closed=true){
        if(e.points.length>1 && deepEqual(e.points[0],e.points.slice(-1)[0])){
            e.points.pop();
        }
        let pts = e.points.reduce(function(acc,p){
            let pt = new paper.Point(p[0],p[1]);
            let polyIndex = p[2];
            acc[polyIndex] ? acc[polyIndex].push(pt) : acc[polyIndex] = [pt];
            return acc;
        },[]);
        let poly=new paper.CompoundPath({
            children:pts.map(function(p){return new paper.Path(p)}),fillRule:'evenodd',
        })
        poly.set({
            strokeColor: e.lineColor,
            fillColor:e.fillColor,
            opacity:_this.totalOpacity,
            strokeWidth:e.lineWidth/_this.currentZoom,
            rescale:{strokeWidth:e.lineWidth},
            closed:closed,
        })
        poly.fillColor && (poly.fillColor.alpha=_this.fillOpacity);
        poly.toDSA=function(){
            let dsa={
                id:e.id,                
                type:'polyline',
                closed:this.closed,
                points:path2xyz(this),
                lineColor:this.strokeColor.toCSS(),
                fillColor:this.fillColor.toCSS(),
                lineWidth:parseFloat(this.rescale.strokeWidth)
            }
            return dsa;
        }
        return poly;
    }
    function makeFreedrawing(e){
        
        let grp=new paper.Group({
            children:e.children.map(function(c){return makePolyline(c)})
        })
        
        grp.toDSA=function(){
            return grp.children.map(function(c){return c.toDSA()}); 
        }
        
        return grp;
    }
    function makeRectangle(e){
        var rect = new paper.Path.Rectangle(new paper.Rectangle(e.center[0]-(e.width/2.0), e.center[1]-(e.height/2.0), e.width, e.height))
        rect.set({
            strokeColor: e.lineColor,
            fillColor:e.fillColor,
            opacity:_this.totalOpacity,
            strokeWidth:e.lineWidth/_this.currentZoom,
            rescale:{strokeWidth:e.lineWidth},
        })
        rect.fillColor.alpha=_this.fillOpacity;
        
        rect.toDSA=function(){
            let dsa={
                id:e.id,
                type:'rectangle',
                center:[this.bounds.center.x,this.bounds.center.y,0],
                width:this.bounds.width,
                height:this.bounds.height,
                rotation:this.getRotation(),
                lineColor:this.strokeColor.toCSS(),
                fillColor:this.fillColor.toCSS(),
                lineWidth:parseFloat(this.rescale.strokeWidth)
            }
            return dsa;
        }
        return rect;
    }
    
    function makePoint(e){        
        var point = new paper.Shape.Circle(new paper.Point(e.center[0],e.center[1]),8.0/_this.currentZoom);
        point.set({
            strokeWidth:e.lineWidth/_this.currentZoom,
            rescale:{strokeWidth:e.lineWidth,radius:8.0},
            strokeColor:e.lineColor,
            fillColor:e.fillColor,
            opacity:_this.totalOpacity,
            radius:8.0/_this.currentZoom,
        })
        point.fillColor.alpha=_this.fillOpacity;
        
        point.toDSA=function(){
            let dsa={
                id:e.id,
                type:'point',
                center:[this.position.x,this.position.y,0],
                lineColor:this.strokeColor.toCSS(),
                fillColor:this.fillColor.toCSS(),
                lineWidth:parseFloat(this.rescale.strokeWidth)
            }
            return dsa;
        }
        return point;
    }
    function makeNewElement(blueprint){
        let item = new paper.Group({});
        item.instructions=blueprint;
        return item;
    }
    function broadcast(eventname,data={}){
        data.eventName=eventname;
        _this.viewer.raiseEvent('DSA2Paper',data);
    }

    function path2xyz(paperObj){
        if(paperObj.getClassName()=='Path'){
            return paperObj.segments.map(function(s){return [s.point.x, s.point.y, 0]});
        } 
        else{
            //Compound Path = handle holes!
            return paperObj.children.map(function(p,i){
                return p.segments.map(function(s){
                    return [s.point.x, s.point.y, i];
                })
            }).flat();
        }
    }
    
    //modified from https://stackoverflow.com/a/32922084/1214731
    function deepEqual(x, y) {
        const ok = Object.keys, tx = typeof x, ty = typeof y;
        return x && y && tx === 'object' && tx === ty? (
            ok(x).length === ok(y).length &&
            ok(x).every(function(key){return deepEqual(x[key], y[key])})
        ) : (x === y);
    }
    
    var Morph = function(initmask){
        this.width=initmask.width,
        this.height=initmask.height,
        this.data = new Uint8Array(initmask.data)
        if(this.data){
            if(this.height * this.width != this.data.length)throw 'MORPH_DIMENSION_ERROR: incorrect dimensions';
        }
        else{
            // this.data = Array.apply(null, new Array(this.height * this.width)).map(Number.prototype.valueOf,0);
            this.data = Array(this.width*this.height).fill(0);
        }
        this.dilate=function(){
            // this.addBorder()
            let o = Array.from(this.data);
            let w = this.width;
            let h = this.height;
            for(var y = 0; y < h ; y++){
                for(var x = 0; x < w ; x++){
                    var ind = y * w + x;
                    this.data[ind] = o[ind] ? o[ind] : (this.adjacentIndices(ind).some(function(i){return o[i]}) ? 1 : 0)
                }
            }
            return {
                width:this.width,
                height:this.height,
                data:this.data
            };
        }
        this.addBorder = function(){
            this.width = this.width+2;
            this.height= this.height+2;
            let orig = this.data;
            this.data = new Uint8Array(this.width * this.height).fill(0);
            for(var y = 1; y < this.height-1 ; y++){
                for(var x = 1; x < this.width-1 ; x++){
                    this.data[ y*this.width + x] = orig[(y-1)*(this.width-2)+(x-1)];
                }
            }
            return {
                width:this.width,
                height:this.height,
                data:this.data
            };
        }
        this.adjacentIndices=function(ind){    
            var ul = ind - this.width - 1;
            var ll = ind + this.width - 1;
            let len=this.data.length;
            return [ul,ul+1,ul+2,ind-1,ind+1,ll,ll+1,ll+2].filter(function(i){return i>=0 && i<len});
        }     
    }

    
    return api;
};

export {DSA2Paper};