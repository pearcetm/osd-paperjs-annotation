import { Feature } from './feature.js';

export class FeatureCollection{
    constructor(init={AnnotationPaper:null}){
        if(!init.AnnotationPaper){
            error('The AnnotationPaper object is required')
        }
        
        let _this=this;
        let Paper = init.AnnotationPaper;
        this._geoJson = init.geoJSON || {type:'FeatureCollection',features:[],properties:{label:'Unnamed collection'}}
        this.element = makeFeatureCollectionElement();

        if(this._geoJson.type!='FeatureCollection') error('Bad geoJSON object, type!="FeatureCollection"');
        this._geoJson.properties = this._geoJson.properties || {};
        this._geoJson.features = this._geoJson.features || [];

        //add styles if needed
        let defaultStyle = init.baseStyle || {};
        this._geoJson.properties = Object.assign({}, defaultStyle, this._geoJson.properties);//allow defined props to override defaults
        this._geoJson.properties.strokeColor && 
            (this._geoJson.properties.strokeColor = new paper.Color(this._geoJson.properties.strokeColor))
        this._geoJson.properties.fillColor && 
            (this._geoJson.properties.fillColor = new paper.Color(this._geoJson.properties.fillColor))
        
        this._featurelist=this.element.find('.features-list');
        this._featurelist.sortable({
            contain:'parent',
            update:function(){
                _this._featurelist.children().each(function(idx,c){
                    let paperitem = $(c).data('feature').paperItem;
                    paperitem.parent.addChild(paperitem);
                })
            },
        });
        this.paperGroup = Paper.createFeatureCollection();
        this.paperGroup.layer.on({
            'selection:mouseenter':function(){_this.element.addClass('svg-hovered').trigger('mouseover')},
            'selection:mouseleave':function(){_this.element.removeClass('svg-hovered').trigger('mouseout')},
            'selected':function(){_this.element.addClass('selected').trigger('selected')},
            'deselected':function(){_this.element.removeClass('selected').trigger('deselected')},
        });

        this.features = function(){
            return _this._featurelist.find('.feature').map(function(_,el){
                return $(el).data('feature');
            }).toArray();
        }
        this.toGeoJSON = function(){
            console.log('FeatureCollection.toGeoJSON',_this._geoJson.properties.label);
            _this._geoJson.features = this.features().map(function(f){
                let gj = f._geoJson;
                gj.geometry = f.paperItem.toGeoJSONGeometry();
                gj.properties.fillColor && gj.properties.fillColor.toCSS &&(gj.properties.fillColor = gj.properties.fillColor.toCSS());
                gj.properties.strokeColor && gj.properties.strokeColor.toCSS && (gj.properties.strokeColor = gj.properties.strokeColor.toCSS());
                return gj;
            });
            return _this._geoJson;
        }
        this.remove = function(){
            _this.paperGroup.layer.remove();
            _this.element.remove();
        }
        

        this.setLabel = function(label){
            this._geoJson.properties.label = label;
        }
        this.label = function(){return _this._geoJson.properties.label};
        // this.style = function(){return _this._geoJson.properties.style;}
        
        this.addFeature=function(feature){
            let props=_this._geoJson.properties;
            // let styleProps=['fillColor','strokeColor','strokeWidth','rescale'].reduce(function(a,k){a[k]=props[k]; return a;},{})
            let styleProps = {
                fillColor:new paper.Color(props.hasOwnProperty('fillColor') ? props.fillColor : defaultStyle.fillColor),
                strokeColor:new paper.Color(props.hasOwnProperty('strokeColor') ? props.strokeColor : defaultStyle.strokeColor),
                strokeWidth: props.hasOwnProperty('strokeWidth') ? props.strokeWidth : defaultStyle.strokeWidth,
                rescale: Object.assign({},props.rescale),
            }
            feature && (feature.properties=Object.assign((feature.properties || {}),Object.assign({},styleProps,feature.properties||{})));
            let f = new Feature({AnnotationPaper:Paper,properties:styleProps, geoJSON:feature});
            _this.paperGroup.group.addChild(f.paperItem);
            // Object.keys(_this._style).forEach(function(k){f[k]=_this._style[k]});
            _this._featurelist.append(f.element);
            _this._featurelist.sortable('refresh');
            return f.element; 
        }

        this.ui={
            setFillColor:setFillColor,
            setStrokeColor:setStrokeColor,
            setStrokeWidth:setStrokeWidth,
            setOpacity:setOpacity,
            setFillOpacity:setFillOpacity,
        }

        function setFillColor(c, applyToChildren){
            _this._geoJson.properties.fillColor = c;
        }
        function setStrokeColor(c, applyToChildren){
            _this._geoJson.properties.strokeColor = c;
        }
        function setStrokeWidth(w, applyToChildren){
            _this._geoJson.properties.strokeWidth = w;
            _this._geoJson.properties.rescale && (_this._geoJson.properties.rescale.strokeWidth=w);
        }
        function setOpacity(o){
            _this.features().forEach(function(f){f.paperItem.opacity = o;})
        }
        function setFillOpacity(o){
            _this.features().forEach(function(f){f.paperItem.fillColor && (f.paperItem.fillColor.alpha = o);})
        }
        
        //action handling and data binding
        _this.element.data({featureCollection:_this});
        _this.element.find('.annotation-header .annotation-name.edit').text(_this.label()).on('value-changed',function(ev,val){
            _this.setLabel(val);
        });

        _this._geoJson.features.forEach(_this.addFeature);
        _this._featurelist.sortable('refresh');

        _this.element.on('click',function(ev){
            ev.stopPropagation();
            Paper.toggleLayerSelection(_this.paperGroup.layer);
        })
        _this.element.find('.visibility-toggle').on('click',function(ev){
            ev.stopPropagation();
            ev.preventDefault();
            _this.element.toggleClass('annotation-hidden');
            _this.paperGroup.layer.visible = !_this.element.hasClass('annotation-hidden');
        });

        _this.element.find('.annotation-header .glyphicon-trash').on('click',function(ev){
            //don't bubble up
            ev.stopPropagation();
            ev.preventDefault();
            //if previously trashed, restore the paperItems
            if(_this.element.hasClass('trashed')){
                _this.element.removeClass('trashed');
                _this.features().map(function(f){_this.paperGroup.addChild(f.paperItem)});
            }
            else{
                _this.element.addClass('trashed');
                _this.features().map(function(f){f.paperItem.remove()});
            }            
            //_this.element.remove();
            
        });
        _this.element.find('.new-feature').on('click',function(ev){
            ev.stopPropagation();
            let el = _this.addFeature();
            $(this).trigger('element-added');
            el.trigger('click');
        });

        _this.element.find('.editablecontent .glyphicon-edit').on('click', function(ev){
            let parent = $(this).closest('.editablecontent');
            parent.addClass('editing');
            let ce = parent.find('.edit').attr('contenteditable',true).focus();
            ce.data('previous-text',ce.text());
            let range = document.createRange();
            range.selectNodeContents(ce[0]);
            let selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);  
        });
        _this.element.on('focusout','.editablecontent.editing .edit', function(){
            let parent=$(this).closest('.editablecontent');
            let oldtext = $(this).data('previous-text');
            let newtext = $(this).text().trim();
            if(newtext !== oldtext) parent.find('.edit').trigger('value-changed',newtext);
            parent.removeClass('editing');
            $(this).removeAttr('contenteditable').text(newtext);
        });
        _this.element.on('keypress','.editablecontent.editing .edit', function(ev){
            ev.stopPropagation();
            if(ev.which==13){
                ev.preventDefault();
                $(this).blur();
            }
        });
        _this.element.on('keydown keyup','.editablecontent.editing .edit',function(ev){ev.stopPropagation()})


        return this;
    }
}

function makeFeatureCollectionElement(){
    let html = `
    <div class='feature-collection'>
        <div class='editablecontent annotation-header'>
            <span class="visibility-toggle"><span class="glyphicon glyphicon-eye-open"></span><span class="glyphicon glyphicon-eye-close"></span></span>
            <span class='annotation-name name edit'>Unnamed collection</span><span class='onhover glyphicon glyphicon-edit'></span><span class='onhover glyphicon glyphicon-trash'></span>
        </div>
        <div class="flex-row features">
            <div class="toggle-list btn-group btn-group-sm"><button class="btn btn-default"><span class='glyphicon glyphicon-collapse-down'></span><span class='glyphicon glyphicon-collapse-up'></span></button></div>
            <div class="annotation-details">
                <div>
                    <div class='features-summary feature-item name'><span class='num-annotations'></span> annotation element<span class='pluralize'></span></div>
                    <div class='features-list'></div>
                </div>
                <div class='new-feature feature'><span class='glyphicon glyphicon-plus'></span>Add feature</div>
            </div>
        </div>
    </div>
    `;
    return $(html);
}