import { AnnotationUI } from './annotationui.js';
import {PaperOverlay} from './paper-overlay.js';
import { AnnotationItemFactory } from './paperitems/annotationitem.js';
import { MultiPolygon } from './paperitems/multipolygon.js';
import { Placeholder } from './paperitems/placeholder.js';
import { Linestring } from './paperitems/linestring.js';
import { MultiLinestring } from './paperitems/multilinestring.js';
import { Raster } from './paperitems/raster.js';
import { Point } from './paperitems/point.js';
import { PointText } from './paperitems/pointtext.js';
import { Rectangle } from './paperitems/rectangle.js';
import { Ellipse } from './paperitems/ellipse.js';

//to do:
// - Add configuration options (as a class, modeled after OpenSeadragon??)
// --- Document configuration options. JSDocs?

//extend paper prototypes to add functionality
//property definitions
Object.defineProperty(paper.Item.prototype, 'hierarchy', hierarchyDef())
Object.defineProperty(paper.Item.prototype, 'descendants', descendantsDef())
Object.defineProperty(paper.Item.prototype, 'displayName', displayNamePropertyDef())
Object.defineProperty(paper.Item.prototype, 'fillOpacity', itemFillOpacityPropertyDef())
Object.defineProperty(paper.Item.prototype, 'strokeOpacity', itemStrokeOpacityPropertyDef())
Object.defineProperty(paper.Item.prototype, 'rescale', itemRescalePropertyDef())
Object.defineProperty(paper.Style.prototype, 'fillOpacity', fillOpacityPropertyDef())
Object.defineProperty(paper.Style.prototype, 'strokeOpacity', strokeOpacityPropertyDef())
Object.defineProperty(paper.Style.prototype, 'rescale', rescalePropertyDef())
Object.defineProperty(paper.CompoundPath.prototype, 'descendants', descendantsDefCompoundPath())//this must come after the Item prototype def to override it
Object.defineProperty(paper.Project.prototype, 'hierarchy', hierarchyDef())
Object.defineProperty(paper.Project.prototype, 'descendants', descendantsDefProject())
Object.defineProperty(paper.Project.prototype, 'fillOpacity', itemFillOpacityPropertyDef())
Object.defineProperty(paper.View.prototype, 'fillOpacity', viewFillOpacityPropertyDef())
Object.defineProperty(paper.Project.prototype, 'strokeOpacity', itemStrokeOpacityPropertyDef())
Object.defineProperty(paper.TextItem.prototype, 'content', textItemContentPropertyDef())

//extend remove function to emit events for GeoJSON type annotation objects
let origRemove=paper.Item.prototype.remove;
paper.Item.prototype.remove=function(){
    (this.isGeoJSONFeature || this.isGeoJSONFeatureCollection) && this.project.emit('item-removed',{item: this});
    origRemove.call(this);
    (this.isGeoJSONFeature || this.isGeoJSONFeatureCollection) && this.emit('removed',{item:this});
}
//function definitions
paper.Group.prototype.insertChildren=getInsertChildrenDef();
paper.Color.prototype.toJSON = paper.Color.prototype.toCSS;//for saving/restoring colors as JSON
paper.Style.prototype.toJSON = styleToJSON;
paper.Style.prototype.set= styleSet;
paper.View.prototype.getImageData = paperViewGetImageData;
paper.View.prototype._multiplyOpacity = true;
paper.PathItem.prototype.toCompoundPath = toCompoundPath;
paper.PathItem.prototype.applyBounds = applyBounds;
paper.Item.prototype.select = paperItemSelect;
paper.Item.prototype.deselect = paperItemDeselect;
paper.Item.prototype.toggle = paperItemToggle;
paper.Item.prototype.updateFillOpacity = updateFillOpacity;
paper.Item.prototype.updateStrokeOpacity = updateStrokeOpacity;
paper.Project.prototype.updateFillOpacity = updateFillOpacity;
//to do: should these all be installed on project instead of scope?
paper.PaperScope.prototype.findSelectedNewItem = findSelectedNewItem;
paper.PaperScope.prototype.findSelectedItems = findSelectedItems;
paper.PaperScope.prototype.findSelectedItem = findSelectedItem;
paper.PaperScope.prototype.createFeatureCollectionLayer = createFeatureCollectionLayer;
paper.PaperScope.prototype.scaleByCurrentZoom = function (v) { return v / this.view.getZoom(); };
paper.PaperScope.prototype.getActiveTool = function(){ return this.tool ? this.tool._toolObject : null; }        

class AnnotationToolkit {
    constructor(openSeadragonViewer, opts) {
        // TO DO: make the options object actually do something
        if(opts){
            console.warn('Configuration options for AnnotationToolkit are not yet supported')
        }

        this._defaultStyle = {
            fillColor: new paper.Color('white'),
            strokeColor: new paper.Color('black'),
            fillOpacity:1,
            strokeOpacity:1,
            strokeWidth: 1,
            rescale: {
                strokeWidth: 1
            }
        };
        this.viewer = openSeadragonViewer;

        this.viewer.addOnceHandler('close', ()=>this.destroy()); //TO DO: make this an option, not a hard-coded default

        this.overlay = new PaperOverlay(this.viewer);

        this.overlay.paperScope.project.defaultStyle = new paper.Style();
        this.overlay.paperScope.project.defaultStyle.set(this.defaultStyle);
        this.overlay.autoRescaleItems(true);

        OpenSeadragon.extend(AnnotationToolkit.prototype, OpenSeadragon.EventSource.prototype);
        OpenSeadragon.EventSource.call(this);
        
        this.viewer.annotationToolkit = this;

        AnnotationItemFactory.register(MultiPolygon);
        AnnotationItemFactory.register(Placeholder);
        AnnotationItemFactory.register(Linestring);
        AnnotationItemFactory.register(MultiLinestring);
        AnnotationItemFactory.register(Raster);
        AnnotationItemFactory.register(Point);
        AnnotationItemFactory.register(PointText);
        AnnotationItemFactory.register(Rectangle);
        AnnotationItemFactory.register(Ellipse);

        paper.Item.fromGeoJSON = AnnotationItemFactory.itemFromGeoJSON;
        paper.Item.fromAnnotationItem = AnnotationItemFactory.itemFromAnnotationItem;
    }


    get defaultStyle(){
        return this._defaultStyle;
    }

    addAnnotationUI(opts = {}){
        if (!this._annotationUI) this._annotationUI = new AnnotationUI(this, opts);
        return this._annotationUI;
    }
    destroy() {
        this.raiseEvent('before-destroy');
        let tool=this.overlay.paperScope && this.overlay.paperScope.getActiveTool();
        if(tool) tool.deactivate(true);

        this.viewer.annotationToolkit = null;
        this._annotationUI && this._annotationUI.destroy();
        this.overlay.destroy();
    }
    setGlobalVisibility(show = false){
        this.overlay.paperScope.view._element.setAttribute('style', 'visibility:' + (show ? 'visible;' : 'hidden;'));
    }
    addFeatureCollections(featureCollections,replaceCurrent){
        this.loadGeoJSON(featureCollections,replaceCurrent);
        this.overlay.rescaleItems();
    }
    getFeatureCollectionLayers(){
        return this.overlay.paperScope.project.layers.filter(l=>l.isGeoJSONFeatureCollection);
    }
    toGeoJSON(){
        //find all featureCollection items and convert to GeoJSON compatible structures
        return this.overlay.paperScope.project.getItems({match:i=>i.isGeoJSONFeatureCollection}).map(layer=>{
            let geoJSON = {
                type:'FeatureCollection',
                features: layer.descendants.filter(d=>d.annotationItem).map(d=>d.annotationItem.toGeoJSONFeature()),
                properties:{
                    defaultStyle: this.defaultStyle.toJSON(),
                    userdata: this.userdata,
                },
                label:this.displayName,
            }
            return geoJSON;
        })
    }
    toGeoJSONString(replacer,space){
        return JSON.stringify(this.toGeoJSON(),replacer,space);
    }
    loadGeoJSON(geoJSON, replaceCurrent){
        if(replaceCurrent){
            this.overlay.paperScope.project.getItems({match:i=>i.isGeoJSONFeatureCollection}).forEach(layer=>layer.remove());
        }
        if(!Array.isArray(geoJSON)){
            geoJSON = [geoJSON];
        }
        geoJSON.forEach(obj=>{
            if(obj.type=='FeatureCollection'){
                let layer = this.overlay.paperScope.createFeatureCollectionLayer(obj.label);
                let props = (obj.properties || {});
                layer.userdata = Object.assign({},props.userdata);
                layer.defaultStyle.set(props.defaultStyle);
                obj.features.forEach(feature=>{
                    let item = paper.Item.fromGeoJSON(feature);
                    layer.addChild(item);
                })
            }
            else{
                console.warn('GeoJSON object not loaded: wrong type. Only FeatureCollection objects are currently supported');
            }
        })
    }
    
};

export {AnnotationToolkit as AnnotationToolkit};



// private functions

function toCompoundPath() {
    if (this.constructor !== paper.CompoundPath) {
        let np = new paper.CompoundPath({ children: [this], fillRule: 'evenodd' });
        np.selected = this.selected;
        this.selected = false;
        return np;
    }
    return this;
}
function applyBounds(boundingItems) {
    if (boundingItems.length == 0)
        return;
    let intersection;
    if (boundingItems.length == 1) {
        let bounds = boundingItems[0];
        intersection = bounds.intersect(this, { insert: false });
    }
    else if (bounding.length > 1) {
        let bounds = new paper.CompoundPath(bounding.map(b => b.clone().children).flat());
        intersection = bounds.intersect(this, { insert: false });
        bounds.remove();
    }
    if (this.children) {
        //compound path
        this.removeChildren();
        this.addChildren(intersection.children ? intersection.children : [intersection]);
    }
    else {
        //simple path
        this.segments = intersection.segments ? intersection.segments : intersection.firstChild.segments;
    }

}
function paperItemSelect(keepOtherSelectedItems) {
    if(!keepOtherSelectedItems){
        this.project._scope.findSelectedItems().forEach(item => item.deselect());
    }
    this.selected = true;
    this.emit('selected');
    this.project.emit('item-selected', { item: this });
}
function paperItemDeselect(keepOtherSelectedItems) {
    if(!keepOtherSelectedItems){
        this.project._scope.findSelectedItems().forEach(item => item.deselect(true));
        return;
    }
    this.selected = false;
    this.emit('deselected');
    this.project.emit('item-deselected', { item: this });
}
function paperItemToggle(keepOtherSelectedItems) {
    this.selected ? this.deselect(keepOtherSelectedItems) : this.select(keepOtherSelectedItems);
}

function findSelectedNewItem() {
    //to do: change this to use type=='Feature' and geometry==null to match GeoJSON spec and AnnotationItemPlaceholder definition
    return this.project.getItems({ selected:true, match: function (i) { return i.isGeoJSONFeature && i.initializeGeoJSONFeature; } })[0];
}
function findSelectedItems() {
    return this.project.getItems({ selected: true, match: function (i) { return i.isGeoJSONFeature; } });
}
function findSelectedItem() {
    return this.findSelectedItems()[0];
}
function createFeatureCollectionLayer(displayLabel=null) {
    let layer = new paper.Layer();
    this.project.addLayer(layer);
    layer.isGeoJSONFeatureCollection = true;
    let layerNum = this.project.layers.filter(l=>l.isGeoJSONFeatureCollection).length;
    layer.name = layer.displayName = displayLabel!==null ? displayLabel : `Annotation Layer ${layerNum}`;
    layer.defaultStyle = new paper.Style(this.project.defaultStyle);
    this.project.emit('feature-collection-added',{layer:layer});
    return layer;
}

function updateFillOpacity(){
    this._computedFillOpacity = this.hierarchy.filter(item=>'fillOpacity' in item && (item._multiplyOpacity||item==this)).reduce((prod,item)=>prod*item.fillOpacity,1);
    if(this.fillColor){
        this.fillColor.alpha = this._computedFillOpacity;
    }
}
function updateStrokeOpacity(){
    if(this.strokeColor){
        this.strokeColor.alpha = this.hierarchy.filter(item=>'strokeOpacity' in item && (item._multiplyOpacity||item==this)).reduce((prod,item)=>prod*item.strokeOpacity,1);
    }
}

function fillOpacityPropertyDef(){
    return {
        set: function opacity(o){
            this._fillOpacity = this._values.fillOpacity = o;
        },
        get: function opacity(){
            return typeof this._fillOpacity === 'undefined' ? 1 : this._fillOpacity;
        }
    }
}
function strokeOpacityPropertyDef(){
    return {
        set: function opacity(o){
            this._strokeOpacity = this._values.strokeOpacity = o;
        },
        get: function opacity(){
            return typeof this._strokeOpacity === 'undefined' ? 1 : this._strokeOpacity;
        }
    }
}
function itemFillOpacityPropertyDef(){
    return {
        set: function opacity(o){
            (this.style || this.defaultStyle).fillOpacity = o;
            this.descendants.forEach(item=>item.updateFillOpacity())
        },
        get: function opacity(){
            return (this.style || this.defaultStyle).fillOpacity;
        }
    }
}
function viewFillOpacityPropertyDef(){
    return {
        set: function opacity(o){
            this._fillOpacity = o;
            this._project.descendants.forEach(item=>item.updateFillOpacity())
        },
        get: function opacity(){
            return this._fillOpacity;
        }
    }
}

function itemStrokeOpacityPropertyDef(){
    return {
        set: function opacity(o){
            this._strokeOpacity = o;
            this.descendants.forEach(item=>item.updateStrokeOpacity())
        },
        get: function opacity(){
            return typeof this._strokeOpacity === 'undefined' ? 1 : this._strokeOpacity;
        }
    }
}
function rescalePropertyDef(){
    return {
        set: function rescale(o){
            this._rescale = this._values.rescale = o;
        },
        get: function rescale(){
            return this._rescale;
        }
    }
}
function itemRescalePropertyDef(){
    return {
        set: function rescale(o){
            this._style.rescale = o;
        },
        get: function rescale(){
            return this._style.rescale;
        }
    }
}
function displayNamePropertyDef(){
    return {
        set: function displayName(input){
            if(Array.isArray(input)){
                this._displayName = new String(input[0]);
                this._displayName.source=input[1];
            }
            else{
                this._displayName = input;
            }
            this.name = this._displayName;
            this.emit('display-name-changed',{displayName:this._displayName});
        },
        get: function displayName(){
            return this._displayName;
        }
    }
}
function hierarchyDef(){
    return {
        get: function hierarchy(){
            return this.parent ? this.parent.hierarchy.concat(this) : this.project ? this.project.hierarchy.concat(this) : [this.view, this];
        }
    }
}
function descendantsDef(){
    return {
        get: function descendants(){
            return (this.children ? this.children.map(child=>child.descendants).flat() : []).concat(this.isGeoJSONFeature ? [this] : []);
        }
    }
}
function descendantsDefCompoundPath(){
    return {
        get: function descendants(){
            return [this];
        }
    }
}
function descendantsDefProject(){
    return {
        get: function descendants(){
            return this.layers ? this.layers.filter(layer=>layer.isGeoJSONFeatureCollection).map(child=>child.descendants).flat() : [this];
        }
    }
}
function styleSet(style){

    var isStyle = style instanceof paper.Style,
        values = isStyle ? style._values : style;
    if (values) {
        for (var key in values) {
            // console.log('setting',key)
            if (key in this._defaults || paper.Style.prototype.hasOwnProperty(key)) {
                var value = values[key];
                this[key] = value && isStyle && value.clone
                        ? value.clone() : value ;
            }
        }
    }
	
}

function styleToJSON(){
    let output={};
    Object.keys(this._values).forEach(key=>{
        output[key] = this[key];//invoke getter
    })
    return output;
}
function paperViewGetImageData(){
    return this.element.getContext('2d').getImageData(0,0,this.element.width, this.element.height);
}

function getInsertChildrenDef(){
    let origInsertChildren = paper.Group.prototype.insertChildren.original || paper.Group.prototype.insertChildren;
    function insertChildren(){ 
        let output = origInsertChildren.apply(this,arguments); 
        let index = arguments[0], children=Array.from(arguments[1]);
        children&&children.forEach((child,i)=>{
            if(child.isGeoJSONFeature){
                let idx = typeof index !== 'undefined' ? index+1 : -1; 
                this.emit('child-added',{item:child,index:idx});
            } 
        });
        return output;
    }
    insertChildren.original = origInsertChildren;
    return insertChildren;
}
function textItemContentPropertyDef(){
    let _set = paper.TextItem.prototype._setContent || Object.getOwnPropertyDescriptor(paper.TextItem.prototype, 'content').set;
    paper.TextItem.prototype._setContent = _set;
    return{
        get: function() {
            return this._content;
        },
        set: function(content) {
            _set.call(this, content);
            this.emit('content-changed');
        },
    }
}