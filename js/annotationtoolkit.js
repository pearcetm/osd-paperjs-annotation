import { AnnotationUI } from './annotationui.js';
import {AnnotationItemPoint} from './paperitems/annotationitempoint.js';
import {AnnotationItemPolygon} from './paperitems/annotationitempolygon.js';
import {AnnotationItemLinestring} from './paperitems/annotationitemlinestring.js';
import {PaperOverlay} from './paper-overlay.js';
import {RotationControlTool} from './papertools/rotationcontrol.js';

//to do:
// - Refactor code to be an actual class rather than just a gigantic constructor function
// - Add configuration options (as a class, modeled after OpenSeadragon??)
// --- Document configuration options. JSDocs?

//extend paper prototypes to add functionality
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
paper.Item.prototype.replace = replaceItem;
paper.Item.prototype.toGeoJSON = paperItemToGeoJson;
paper.Group.prototype.toGeoJSON = paperGroupToGeoJson;
paper.Project.prototype.toGeoJSON = paperProjectToGeoJson;
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
paper.Item.fromGeoJSON = paperItemFromGeoJson;
paper.Project.prototype.updateFillOpacity = updateFillOpacity;
paper.PaperScope.prototype.findSelectedNewItem = findSelectedNewItem;
paper.PaperScope.prototype.findSelectedPolygon = findSelectedPolygon;
paper.PaperScope.prototype.findSelectedItems = findSelectedItems;
paper.PaperScope.prototype.findSelectedItem = findSelectedItem;
paper.PaperScope.prototype.createFeatureCollectionLayer = createFeatureCollectionLayer;
paper.PaperScope.prototype.initializeItem = initializeItem;
paper.PaperScope.prototype.scaleByCurrentZoom = function (v) { return v / this.view.getZoom(); };
paper.PaperScope.prototype.getActiveTool = function(){ return this.tool ? this.tool._toolObject : null; }        

class AnnotationToolkit {
    constructor(openSeadragonViewer, opts) {

        var _this = this;
        _this._defaultStyle = {
            fillColor: new paper.Color('white'),
            strokeColor: new paper.Color('black'),
            fillOpacity:1,
            strokeOpacity:1,
            strokeWidth: 1,
            rescale: {
                strokeWidth: 1
            }
        };
        _this.viewer = openSeadragonViewer;
        _this.overlay = _this.viewer.addPaperOverlay();
        _this.overlay.paperScope.project.defaultStyle = new paper.Style();
        _this.overlay.paperScope.project.defaultStyle.set(_this._defaultStyle);


        
        

        _this.viewer.addOnceHandler('close', close); //TO DO: make this an option, not a hard-coded default

        // _this.overlay.rescaleItems();
        _this.overlay.autoRescaleItems(true);

        const api = _this.api = {
            addAnnotationUI: function (opts={}) {
                if (!_this._annotationUI) _this._annotationUI = new AnnotationUI(_this, opts);
                return _this._annotationUI;
            },
            addRotationControlOverlay:function(){
                let rcOverlay = new PaperOverlay(_this.viewer,{overlayType:'viewport'})
                let rcTool = new RotationControlTool(rcOverlay.paperScope);
                _this.viewer.addButton({
                    faIconClasses:'fa-solid fa-rotate',
                    tooltip:'Rotate image',
                    onClick:()=>{
                        console.log('Mwahahaha');
                        rcTool.active ? rcTool.deactivate(true) : rcTool.activate();
                        rcTool.active = !!!rcTool.active;
                    }
                });
                return rcOverlay;
            },
            remove: remove,
            setGlobalVisibility: function (show = false) {
                _this.overlay.paperScope.view._element.setAttribute('style', 'visibility:' + (show ? 'visible;' : 'hidden;'));
            },
            _overlay:_this.overlay,
        };

        function remove() {
            _this.viewer.annotationToolkit = null;
            _this._annotationUI && _this._annotationUI.destroy();
        }
        
        
        
        _this.viewer.annotationToolkit = api;
        return api;
    }
    get defaultStyle(){
        return this._defaultStyle;
    }
};

export {AnnotationToolkit as AnnotationToolkit};


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
function paperItemSelect(setProperty = true) {
    (this.selected = true) && setProperty;
    this.emit('selected', new paper.Event());
    this.project.emit('item-selected', { item: this });
}
function paperItemDeselect(unsetProperty = true) {
    unsetProperty && (this.selected = false);
    this.emit('deselected', new paper.Event());
    this.project.emit('item-deselected', { item: this });
}
function paperItemToggle(keepCurrent) {
    let itemIsSelected = this.selected;
    if (itemIsSelected && (keepCurrent || this.project._scope.findSelectedItems().length == 1)) {
        this.selected = false;
        this.deselect();
    }
    else {
        !keepCurrent && this.project._scope.findSelectedItems().forEach(item => item.deselect());
        this.select();
    }
}

function findSelectedNewItem() {
    //relies on the presence of a custom "instructions" property to identify uninitialized items
    //only return selected items
    return this.project.getItems({ selected:true, match: function (i) { return i.instructions; } })[0];
}
function findSelectedPolygon() {
    return this.project.getItems({ selected: true, class: paper.CompoundPath })[0];
}
function findSelectedItems() {
    return this.project.getItems({ selected: true, match: function (i) { return i.isAnnotationFeature; } });
}
function findSelectedItem() {
    return this.findSelectedItems()[0];
}
function createFeatureCollectionLayer() {
    let layer = new paper.Layer();
    layer.isAnnotationLayer = true;
    layer.name = layer.displayName = 'AnnotationLayer';
    this.project.addLayer(layer);
    let group = new paper.Group();
    group.name = 'elements';
    layer.addChild(group);
    layer.bringToFront = function () { layer.addTo(this.project); };
    let style = new paper.Style(this.project.defaultStyle);
    layer.defaultStyle = style;
    return { layer: layer, group: group, style:style._values };
}

function updateFillOpacity(){
    if(this.fillColor){
        this.fillColor.alpha = this.hierarchy.filter(item=>'fillOpacity' in item && (item._multiplyOpacity||item==this)).reduce((prod,item)=>prod*item.fillOpacity,1);
    }
}
function updateStrokeOpacity(){
    if(this.strokeColor){
        this.strokeColor.alpha = this.hierarchy.filter(item=>'strokeOpacity' in item && (item._multiplyOpacity||item==this)).reduce((prod,item)=>prod*item.strokeOpacity,1);
    }
}


function initializeItem(geoJSONGeometryType, geometrySubtype) {
    let item = this.findSelectedNewItem();
    let geoJSON = item.instructions;
    geoJSON.geometry = {
        type: geoJSONGeometryType,
        coordinates: [],
        properties: {
            subtype:geometrySubtype,
        },
    };
    
    let newItem = paper.Item.fromGeoJSON(geoJSON);
    // newItem.selected=item.selected;
    item.replace && item.replace(newItem);
        
    return newItem;
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
// function itemFillOpacityPropertyDef(){
//     return {
//         set: function opacity(o){
//             this._fillOpacity = o;
//             this.descendants.forEach(item=>item.updateFillOpacity())
//         },
//         get: function opacity(){
//             return typeof this._fillOpacity === 'undefined' ? 1 : this._fillOpacity;
//         }
//     }
// }
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
            return this.children ? this.children.map(child=>child.descendants).flat() : [this];
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
            return this.layers ? this.layers.filter(layer=>layer.isAnnotationLayer).map(child=>child.descendants).flat() : [this];
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
function replaceItem(newItem){
    newItem._callbacks = this._callbacks;
    let rescale = $.extend(true,this.rescale,newItem.rescale);
    newItem.style = this.style; //to do: make this work with rescale properties, so that rescale.strokeWidth doesn't overwrite other props
    newItem.rescale=rescale;
    //replace in the paper hierarchy
    this.replaceWith(newItem);
    newItem.selected = this.selected;
    // console.log('replacing',this,newItem)
    this.emit('item-replaced',{item:newItem});
    newItem.updateFillOpacity();
    newItem.applyRescale();
    newItem.project.view.update();
    newItem.project.emit('item-replaced',{item:newItem});
    return newItem;
}

function paperItemFromGeoJson(geoJSONFeature) {
    let factory = {
        Point: geoJSON=>new AnnotationItemPoint(geoJSON),
        LineString: geoJSON=>new AnnotationItemLinestring(geoJSON),
        Polygon: geoJSON=>new AnnotationItemPolygon(geoJSON),
    };

    let type = (geoJSONFeature.geometry && geoJSONFeature.geometry.type) || 'null';
    if (factory.hasOwnProperty(type) === false) {
        error(`No method defined for type ${type}`);
    }
    var obj = factory[type](geoJSONFeature);
    obj.style.set(geoJSONFeature.properties);
    obj.isAnnotationFeature = true;

    return obj;

}
function paperItemToGeoJson(){
    console.log('Creating GeoJSON structure',this)
    let GeoJSON = {
        type:'Feature',
        geometry:this.toGeoJSONGeometry ? this.toGeoJSONGeometry() : null,
        properties:{
            label:this.displayName,
            ...this.style.toJSON(),
        }
    }
    return GeoJSON;
}
function paperGroupToGeoJson(){
    console.log('Creating GeoJSON structure',this);
    let GeoJSON = {
        type:'FeatureCollection',
        features: this.descendants.filter(d=>d.isAnnotationFeature).map(d=>d.toGeoJSON()),
        properties:{
            ...this.defaultStyle.toJSON(),
        },
        label:this.displayName,
    }
    return GeoJSON;
}
function paperProjectToGeoJson(){
    return this.getItems({match:i=>i.isAnnotationLayer}).map(l=>l.toGeoJSON())
}
function styleToJSON(){
    let output={};
    Object.keys(this._values).forEach(key=>{
        output[key] = this[key];//invoke getter
    })
    return output;
}
function paperViewGetImageData(){
    //let canvas = this.element;
    return this.element.getContext('2d').getImageData(0,0,this.element.width, this.element.height);
}