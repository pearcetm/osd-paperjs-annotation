export class AnnotationItem{
    constructor(feature){
        if(GeometryTypes.includes( (feature.geometry && feature.geometry.type) || feature.geometry ) === false){
            throw('Bad GeoJSON Geometry type');
        }
        this._paperItem = null;
        this._props = feature.properties;
        this.userdata = Object.assign({}, this._props.userdata);//ensure userdata field exists
    }
    static get supportsType(){
        return {
            type: undefined,
            subtype: undefined,
        }
    }
    getCoordinates(){
        return []
    }
    getProperties(){
        return {}
    }
    getStyleProperties(){
        return this.paperItem.style.toJSON();
    }
    // static getGeometry(){}
    static onTransform(){}

    get supportsType(){
        return this.constructor.supportsType;
    }
    getLabel(){
        return this.paperItem.displayName || this.constructor.supportsType.subtype || this.constructor.supportsType.type;
    }

    get type(){
        return this.constructor.supportsType.type;
    }
    get subtype(){
        return this.constructor.supportsType.subtype;
    }

    get paperItem(){
        return this._paperItem;
    }
    set paperItem(paperItem){
        this._paperItem = paperItem;
        //apply special properties that make the paper.Item an AnnotationItem
        convertPaperItemToAnnotation(this);
    }

    // default implmentation; can be overridden for custom behavior by subclasses
    setStyle(properties){
        this._paperItem && this._paperItem.style.set(properties);
    }

    // default implementation; can be overridden for custom behavior by subclasses
    toGeoJSONFeature(){
        let geoJSON = {
            type:'Feature',
            geometry:this.toGeoJSONGeometry(),
            properties:{
                label:this.paperItem.displayName,
                selected:this.paperItem.selected,
                ...this.getStyleProperties(),
                userdata:this.userdata,
            }
        }

        return geoJSON;
    }

    // default implementation; can be overridden for custom behavior by subclasses
    toGeoJSONGeometry(){
        let geom = {
            type: this.type,
            properties: this.getProperties(),
            coordinates: this.getCoordinates(),
        }
        if(this.subtype){
            geom.properties = Object.assign(geom.properties, {subtype: this.subtype});
        }
        return geom;
    }

}

const GeometryTypes = ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection', null];

const _constructors = [];

export class AnnotationItemFactory{
    constructor(){
        // this._constructors=[];
    }
    static register(ctor){
        //to do: add logic to test whether the object has implemented the necessary API
        if(ctor.supportsType === AnnotationItem.supportsType){
            console.error('Static accessor supportsType must be implemented');
            throw('Static accessor supportsType must be implemented');
        }
        if(!_constructors.includes(ctor)){
            _constructors.push(ctor);
        }
    }
    
    static getConstructor(geoJSON){
        if(!('geometry' in geoJSON && 'properties' in geoJSON)){
            console.error('Invalid GeoJSON Feature object. Returning undefined.');
            return;
        }

        let geometry = geoJSON.geometry;
        let gprops = geometry && geometry.properties || {};
        // let properties = geoJSON.properties;

        let geomType = geometry && geometry.type || undefined;
        let geomSubtype = gprops.subtype;

        let constructors = _constructors.filter(c=>c.supportsType.type==geomType && c.supportsType.subtype === geomSubtype);
        
        return constructors.slice(-1)[0]; //return the most recent constructor that supports this type
    }

    static itemFromGeoJSON(geoJSON){
        if(GeometryTypes.includes(geoJSON.type)){
            geoJSON = {
                type: 'Feature',
                geometry: geoJSON,
                properties: {},
            }
        }
        let ctor = AnnotationItemFactory.getConstructor(geoJSON);
        if(ctor){
            let annotationItem = new ctor(geoJSON);
            return annotationItem.paperItem;
        }
    }

    static itemFromAnnotationItem(item){
        if(!item.annotationItem){
            error('Only paper.Items constructed by AnnotationItem implementations are supported');
            return;
        }
        let geoJSON = {
            type:'Feature',
            geometry: item.annotationItem.toGeoJSONGeometry(),
            properties:item.annotationItem._props,
        };
        return AnnotationItemFactory.itemFromGeoJSON(geoJSON);
    }

}

function convertPaperItemToAnnotation(annotationItem){
    let item = annotationItem.paperItem;
    let constructor = annotationItem.constructor;
    let properties = annotationItem._props;

    item.isGeoJSONFeature = true;
    item.onTransform = constructor.onTransform;

    //style
    annotationItem.setStyle(properties);

    //set fillOpacity property based on initial fillColor alpha value
    item.fillOpacity = item.fillColor ? item.fillColor.alpha : 1;

    //displayName
    item.displayName = properties.label || annotationItem.getLabel();

    item.annotationItem = annotationItem;
    
    //enhance replaceWith functionatily
    item.replaceWith = enhancedReplaceWith;

    //selected or not
    if('selected' in properties){
        item.selected = properties.selected;
    }
}


function enhancedReplaceWith(newItem){
    if(!newItem.isGeoJSONFeature){
        console.warn('An item with isGeoJSONFeature==false was used to replace an item.');
    }
    newItem._callbacks = this._callbacks;
    let rescale = OpenSeadragon.extend(true,this.rescale,newItem.rescale);
    newItem.style = this.style; //to do: make this work with rescale properties, so that rescale.strokeWidth doesn't overwrite other props
    newItem.rescale=rescale;
    //replace in the paper hierarchy
    this.emit('item-replaced',{item:newItem});
    newItem.project.emit('item-replaced',{item:newItem});
    paper.Item.prototype.replaceWith.call(this, newItem);
    newItem.selected = this.selected;
    newItem.updateFillOpacity();
    newItem.applyRescale();
    newItem.project.view.update();
    return newItem;
}