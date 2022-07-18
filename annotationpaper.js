//requires paper.js and openseadragon-paperjs-overlay.js
import {DefaultTool} from './papertools/default.js';
import {WandTool} from './papertools/wand.js';
import {BrushTool} from './papertools/brush.js';
import {PointTool} from './papertools/point.js';
import {RectangleTool} from './papertools/rectangle.js';
import {StyleTool} from './papertools/style.js';
import {LinestringTool} from './papertools/linestring.js';
import {PolygonTool} from './papertools/polygon.js';
import {TransformTool} from './papertools/transform.js';
import {RasterTool} from './papertools/raster.js';


import {AnnotationToolbar} from './annotationtoolbar.js';

function AnnotationPaper(openSeadragonViewer){
    var _this = this;
    _this.selectionModeEnabled=false;
    _this._defaultStyle={
        fillColor:new paper.Color('white'),
        strokeColor: new paper.Color('black'),
        strokeWidth:1,
        rescale:{
            strokeWidth:1
        }
    }
    _this.defaultStyle = function(){ return _this._defaultStyle; }
    let ps;
    _this.viewer = openSeadragonViewer;
    // _this.overlay = _this.viewer.paperjsOverlay({scale:_this.viewer.tileSources.width || 1});
    _this.overlay = _this.viewer.paperjsOverlay();
    _this.canvas = _this.overlay._paperCanvas;
    _this.canvas.addClass=function(c){;
        this.element.classList.add(c);
        return this.element;
    }
    _this.canvas.removeClass=function(c){
        this.element.classList.remove(c);
        return this.element;
    }

    //extend paper prototypes
    // paper.Path.prototype.toCompoundPath = toCompoundPath;
    // paper.CompoundPath.prototype.toCompoundPath=toCompoundPath;
    paper.PathItem.prototype.toCompoundPath = toCompoundPath;
    paper.PathItem.prototype.applyBounds = applyBounds;
    paper.Item.prototype.select = function(setProperty=true){this.selected=true&&setProperty;this.emit('selected');}
    paper.Item.prototype.deselect = function(unsetProperty=true){unsetProperty&&(this.selected=false);this.emit('deselected');}

    // _this.viewer.addHandler('resize',function(){_this.overlay.resize();});
    
    // _this.viewer.addHandler('AnnotationUI',AnnotationUIHandlers);
    _this.viewer.addOnceHandler('close', close)
    // _this.viewer.addOnceHandler('open', ()=>_this.overlay.rescale());
    
    // _this.overlay = _this.viewer.paperjsOverlay();
    // _this.canvas = _this.overlay._paperCanvas;
    // _this.canvas.addClass=function(c){;
    //     this.element.classList.add(c);
    //     return this.element;
    // }
    // _this.canvas.removeClass=function(c){
    //     this.element.classList.remove(c);
    //     return this.element;
    // }

    
    ps = _this.overlay._paperScope;
    window.ps=ps;
    window._canvas = _this.canvas;
    _this.overlay.rescale();
    _this.overlay.handleRescale(true);
    _this.overlay.resizeCanvas();
    
    const api = _this.api = {
        createFeatureCollection:function(){
            let layer= new paper.Layer();
            layer.isAnnotationLayer=true;
            layer.name='AnnotationLayer';
            ps.project.addLayer(layer);
            let group= new paper.Group();
            group.name = 'elements';
            layer.addChild(group);
            layer.bringToFront = function(){layer.addTo(ps.project)}
            return {layer:layer,group:group};
        },
        close:close,
        // makeObject:makeObject,
        fromGeoJSON:makeObject,
        
        setGlobalVisibility: function(visible=false){
            ps.view._element.setAttribute('style','visibility:'+(visible?'visible;':'hidden;'));
        },

        //StyleTool interface accessors
        pickColor:function(){
            return _this.tools.style.pickColor();
        },
        getAverageColor:function(item){
            return _this.tools.style.getAverageColor(item);
        },

        //SelectionTool interface accessors
        toggleItemSelection:function(item,keepCurrent){
            return _this.tools.transform.toggleItemSelection(item,keepCurrent);
        },
        toggleLayerSelection:function(layer,keepCurrent){
            return _this.tools.transform.toggleLayerSelection(layer,keepCurrent);
        },

        //Why are we scaling in the API?
        scaleByCurrentZoom:function(v){
            return v/ps.view.getZoom();
        },
        showToolbar:function(){_this.toolbar && _this.toolbar.show();},
        hideToolbar:function(){_this.toolbar && _this.toolbar.hide();},
    }
    
    let toolbar = new AnnotationToolbar(api);
    _this.toolbar = toolbar;
    _this.tools = toolSetup(toolbar);
    toolbar.addToOpenSeadragon(openSeadragonViewer);
    toolbar.hide();//start as hidden; when the AnnotationUI dialog opens, the toolbar will be shown.
    
    function close(){
        console.log('cleaning up paper by setting annotationPaper to null');
        _this.viewer.annotationPaper = null;
        _this.toolbar.destroy();
        // ps.remove();
    }
    function makeObject(geoJSONFeature){
        let type = (geoJSONFeature.geometry && geoJSONFeature.geometry.type) || 'null'; 
        if(factory.hasOwnProperty(type)===false) {
            error(`No method defined for type ${type}`);
        }
        var obj = factory[type](geoJSONFeature);
        obj.isAnnotationFeature=true;
        obj.on({
            'updated':function(){
                toolbar.setMode(this);
            },
            'selected':function(){
                _this.tools.transform.getSelectedItems().length==1 ? toolbar.setMode(this) : toTransformMode();
                let activeTool = getActiveTool();
                activeTool && activeTool.selectionChanged();
            },
            'deselected':function(){
                let selected=_this.tools.transform.getSelectedItems();
                selected.length==1? toolbar.setMode(selected[0]) : toTransformMode();
                let activeTool = getActiveTool();
                activeTool && activeTool.selectionChanged();
            },
            
        });
        return obj;
        function toTransformMode(){
            let activeTool = getActiveTool();
            // activeTool==_this.tools.transform? activeTool.selectionChanged() : activeTool.deactivate(true);
            activeTool && activeTool !== _this.tools.transform && (activeTool.deactivate(true), _this.tools.default.activate());
            toolbar.setMode('transform'); 
        }
    }

    var factory = {
        Point:makePoint,
        LineString:makeLineString,
        Polygon:makePolygon,
        null:makeNewElement,
    }

    
    

    function toolSetup(toolbar){
        let toolLayer=new paper.Layer();
        toolLayer.isAnnotationLayer=false;
        toolLayer.name = 'toolLayer';

        let projectInterface={
            findSelectedItem:findSelectedItem,
            findSelectedPolygon:findSelectedPolygon,
            initializeItem:initializeItem,
            getZoom:()=>ps.view.getZoom(),
            getActiveTool:getActiveTool, 
            // broadcast:broadcast,
            toolLayer:toolLayer,
            viewer:_this.viewer,
            paperScope:_this.overlay._paperScope,
            canvasEl:_this.overlay._paperCanvas.element,
            
        }
        
        let tools = {
            default:new DefaultTool(projectInterface),
            transform:new TransformTool(projectInterface),
            rectangle:new RectangleTool(projectInterface),
            point: new PointTool(projectInterface),
            polygon: new PolygonTool(projectInterface),
            brush: new BrushTool(projectInterface),
            wand: new WandTool(projectInterface),
            linestring : new LinestringTool(projectInterface),
            raster: new RasterTool(projectInterface),
            style: new StyleTool(projectInterface),
        }
        Object.keys(tools).forEach(function(toolname){
            let toolObj = tools[toolname];
            toolObj.tool._toolObject=toolObj;
            toolObj.toolname=toolname;
            let toolbarControl = toolObj.getToolbarControl();
            if(toolbarControl) toolbar.addTool(toolbarControl);

            if(toolObj !== tools.default){
                toolObj.addEventListener('deactivated',function(ev){
                    if(ev.finished){
                        tools.default.activate();
                    }
                })
            }
            
        })
        return tools;
    }

    
    
    

    function getActiveTool(){
        return ps.tool ? ps.tool._toolObject._active && ps.tool._toolObject : null;
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
    function applyBounds(boundingItems){
        if(boundingItems.length==0) return;
        let intersection;
        if(boundingItems.length==1){
            let bounds = boundingItems[0];
            intersection = bounds.intersect(this,{insert:false});
        }
        else if(bounding.length>1){
            let bounds = new paper.CompoundPath(bounding.map(b=>b.clone().children).flat());
            intersection = bounds.intersect(this,{insert:false});
            bounds.remove();
        }
        if(this.children){
            //compound path
            this.removeChildren();
            this.addChildren(intersection.children ? intersection.children : [intersection])
        }
        else{
            //simple path
            this.segments = intersection.segments ? intersection.segments : intersection.firstChild.segments;
        }   
        // let replaced=shape.replaceWith(intersection);
        // replaced && (shape=intersection);            
    }
    
    function findNewItem(){
        return ps.project.getItems({match:function(i){return i.instructions}})[0];
    }
    function findSelectedPolygon(){
        return ps.project.getItems({selected:true,class:paper.CompoundPath})[0];
    }
    function findSelectedItem(){
        return ps.project.getItems({selected:true,match:function(i){return i.isAnnotationFeature} })[0];
    }
    function applyProperties(item){
        let input = item.config.properties || _this.defaultStyle();
        let sw = input.rescale&&input.rescale.hasOwnProperty('strokeWidth') ? _this.api.scaleByCurrentZoom(input.rescale.strokeWidth) : input.strokeWidth;
        let overrides={strokeWidth:sw, }
        let style = Object.assign({},input,overrides );

        console.log('applying properties',style);
        item.set(style);
        console.log('after apply',item.fillColor,item.strokeColor);
    }  
    
    function makePolygon(geoJSON){
        if(geoJSON.geometry.type!=='Polygon'){
            error('Bad geoJSON object: type !=="Polygon"');
        }
        let coords = geoJSON.geometry.coordinates;//array of array of points
        let paths = coords.map(function(points){
            let pts = points.map(function(point){
                return new paper.Point(point[0], point[1]);
            });
            return new paper.Path(pts);
        })
        
        let poly=new paper.CompoundPath({
            children:paths,
            fillRule:'evenodd',
            closed:true,
        })
        poly.config=geoJSON;
        applyProperties(poly);
        
        
        poly.toGeoJSONGeometry=function(){
            let g = this.config.geometry;
            g.coordinates = this.children.map(function(c){return c.segments.map(function(s){ return [s.point.x, s.point.y] }) });
            return g;
        }
        poly.makeRaster = function(raster){makeRaster(this,raster)}

        if(geoJSON.geometry.properties && geoJSON.geometry.properties.subtype=='Raster'){
            setTimeout(()=> {
                let raster = new paper.Raster(geoJSON.geometry.properties.rasterdata);
                // raster.position = poly.position;
                raster.set({matrix:geoJSON.geometry.properties.rastermatrix});
                let grp = makeRaster(poly,raster);
                grp.set({matrix:geoJSON.geometry.properties.matrix})
            }, 0);
        }
        
        return poly;
    }
    function makeRaster(poly, raster){

        let grp = new paper.Group([]);
        grp.isAnnotationFeature=true;
        // raster.isAnnotationFeature=true;
        poly.isAnnotationFeature=false;
        grp.config = Object.assign({},poly.config);
        grp.config.geometry.properties.subtype='Raster';
        poly.replace(grp);
        grp.addChild(poly);
        grp.addChild(raster);
        grp.clipped=true;
        poly.deselect();
        grp.select();
        grp.toGeoJSONGeometry = function(){
            let g = poly.toGeoJSONGeometry();
            this.config.geometry.coordinates = g.coordinates;
            this.config.geometry.properties.matrix=this.matrix.values;
            this.config.geometry.properties.rasterdata = raster.toDataURL();
            this.config.geometry.properties.rastermatrix=raster.matrix.values;
            return this.config.geometry;
        }
        return grp;
    }

    function makeLineString(geoJSON){
        if(geoJSON.geometry.type!=='LineString'){
            error('Bad geoJSON object: type !=="LineString"');
        }
        let coords = geoJSON.geometry.coordinates;//array of points
        let paths = coords.map(function(points){
            let pts = points.map(function(point){
                return new paper.Point(point[0], point[1]);
            });
            return new paper.Path(pts);
        })
        
        let grp=new paper.Group({
            children:paths
        })
        grp.config=geoJSON;
        grp.config.properties.rescale && (delete grp.config.properties.rescale.strokeWidth);
        // console.log(grp.config);
        applyProperties(grp);
        grp.fillColor = null;
        grp.isLineString=true;
        
        grp.toGeoJSONGeometry=function(){
            let g = this.config.geometry;
            g.coordinates = this.children.map(function(c){return c.segments.map(function(s){ return [s.point.x, s.point.y] }) });
            this.config.properties.strokeWidths=this.children.map(c=>c.strokeWidth);
            return g;
        }
        
        return grp;
    }
    function makePoint(geoJSON){ 
        if(geoJSON.geometry.type!=='Point'){
            error('Bad geoJSON object: type !=="Point"');
        }       
        let coords = geoJSON.geometry.coordinates.length==2 ? geoJSON.geometry.coordinates : [0,0];
        // let point = new paper.Shape.Circle(new paper.Point(...coords), _this.api.scaleByCurrentZoom(8.0));
        let point = new paper.Path.Circle(new paper.Point(...coords), _this.api.scaleByCurrentZoom(8.0));
        point.config = geoJSON;

        applyProperties(point);
        point.rescale = point.rescale || {};
        point.rescale.radius = function(z){
            let temp = new paper.Path.Circle(point.matrix.inverseTransform(point.position),8.0/z);
            point.segments = temp.segments;
            temp.remove();
        };
        
        point.toGeoJSONGeometry=function(){
            let g = this.config.geometry;
            g.coordinates=[this.position.x,this.position.y];
            return g;
        }
        
        return point;
    }
    

    
    function initializeItem(geoJSONGeometryType, geometrySubtype=null){
        let item = findNewItem() || findSelectedPolygon();
        // console.log('Init item if needed:',item)
        if(item&&item.instructions){
            // console.log('Init instructions',item.instructions)
            let geoJSON=item.instructions;
            geoJSON.geometry ={
                type:geoJSONGeometryType,
                coordinates:[],
                properties:{},
            };
            if(geometrySubtype) geoJSON.geometry.properties.subtype=geometrySubtype;
            let newItem = makeObject(geoJSON);
            item.replace(newItem);
            item = newItem;
            item.selected=true;
        }
        return item;
    }  

    function makeNewElement(blueprint){
        let item = new paper.Group({});
        item.instructions=blueprint;
        return item;
    }
    function broadcast(eventname,data={}){
        data.eventName=eventname;
        _this.viewer.raiseEvent('AnnotationPaper',data);
    }
    
    //modified from https://stackoverflow.com/a/32922084/1214731
    // function deepEqual(x, y) {
    //     const ok = Object.keys, tx = typeof x, ty = typeof y;
    //     return x && y && tx === 'object' && tx === ty? (
    //         ok(x).length === ok(y).length &&
    //         ok(x).every(function(key){return deepEqual(x[key], y[key])})
    //     ) : (x === y);
    // }
    
    

    broadcast('paper-created',{AnnotationPaper:api});
    _this.viewer.annotationPaper = api;
    return api;
};

export {AnnotationPaper};