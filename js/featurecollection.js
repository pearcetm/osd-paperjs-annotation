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
        this.paperObjects = Paper.createFeatureCollectionLayer(this);//previously called paperGroup
        this.paperObjects.layer.on({
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
            _this.paperObjects.layer.remove();
            _this.element.remove();
        }
        this.numFeatures = function(){
            return _this.features().length;
        }

        this.setLabel = function(label){
            this._geoJson.properties.label = label;
        }
        this.label = function(){return _this._geoJson.properties.label};
        
        this.addFeature=function(feature){
            let props=_this._geoJson.properties;
            let styleProps = {
                fillColor:new paper.Color(props.hasOwnProperty('fillColor') ? props.fillColor : defaultStyle.fillColor),
                strokeColor:new paper.Color(props.hasOwnProperty('strokeColor') ? props.strokeColor : defaultStyle.strokeColor),
                strokeWidth: props.hasOwnProperty('strokeWidth') ? props.strokeWidth : defaultStyle.strokeWidth,
                rescale: Object.assign({},props.rescale),
            }
            feature && (feature.properties=Object.assign((feature.properties || {}),Object.assign({},styleProps,feature.properties||{})));
            let f = new Feature({AnnotationPaper:Paper,properties:styleProps, geoJSON:feature});
            _this.paperObjects.group.addChild(f.paperItem);
            f.paperItem.deselect();//insert the item as deselected
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
            Paper.toggleLayerSelection(_this.paperObjects.layer);
        })
        _this.element.find('.visibility-toggle').on('click',function(ev){
            ev.stopPropagation();
            ev.preventDefault();
            _this.element.toggleClass('annotation-hidden');
            _this.paperObjects.layer.visible = !_this.element.hasClass('annotation-hidden');
        });
        _this.element.find('.toggle-list').on('click',function(ev){
            let numFeatures = _this._featurelist.children().length;
            _this.element.find('.num-annotations').text(numFeatures);
            _this.element.find('.features-summary').attr('data-num-elements',numFeatures);
            _this.element.find('.features').toggleClass('collapsed');
            ev.stopPropagation();
            ev.preventDefault();
        });

        _this.element.find('.annotation-header [data-action="trash"]').on('click',function(ev){
            //don't bubble up
            ev.stopPropagation();
            ev.preventDefault();
            //if previously trashed, restore the paperItems
            // To Do: add option for user to choose whether to restore or permanently remove
            if(_this.element.hasClass('trashed')){
                _this.element.removeClass('trashed');
                _this.features().map(function(f){
                    _this.paperObjects.group.addChild(f.paperItem);
                    f.paperItem.deselect();//insert objects as deselected
                });
            }
            else{
                _this.element.addClass('trashed');
                _this.features().map(function(f){
                    f.paperItem.remove();
                    f.paperItem.deselect();//ensure items are deselected
                });
            }   
            
        });
        _this.element.find('.new-feature').on('click',function(ev){
            ev.stopPropagation();
            let el = _this.addFeature();
            $(this).trigger('element-added');
            el.trigger('click');
        });

        _this.element.find('.editablecontent [data-action="edit"]').on('click', function(ev){
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
            <span class="visibility-toggle"><span class="fa fa-eye" data-action="hide"></span><span class="fa fa-eye-slash" data-action="show"></span></span>
            <span class='annotation-name name edit'>Unnamed collection</span><span class='onhover fa fa-edit' data-action="edit"></span><span class='onhover fa-solid fa-trash-can' data-action='trash'></span>
        </div>
        <div class="flex-row features">
            <div class="toggle-list btn-group btn-group-sm"><button class="btn btn-default"><span class='fa-solid fa-caret-down' data-action="collapse-down"></span><span class='fa-solid fa-caret-up' data-action="collapse-up"></span></button></div>
            <div class="annotation-details">
                <div>
                    <div class='features-summary feature-item name'><span class='num-annotations'></span> annotation element<span class='pluralize'></span></div>
                    <div class='features-list'></div>
                </div>
                <div class='new-feature feature'><span class='fa fa-plus' data-action="add-feature"></span>Add feature</div>
            </div>
        </div>
    </div>
    `;
    return $(html);
}