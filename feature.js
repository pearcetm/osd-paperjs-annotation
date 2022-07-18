export class Feature{
    constructor(opts={}){
        let _this=this;
        let el = makeFeatureElement();
        if(!opts.AnnotationPaper){
            error('An instance of AnnotationPaper must be passed in the options object')
        }
        if(opts.geoJSON && opts.geoJSON.type !== 'Feature'){
            error('Error! Bad geoJSON input. geoJSON.type !== "Feature"')
        }
        let Paper = opts.AnnotationPaper;
        let guid= 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c) {
            let r = Math.random() * 16|0;
            let v = c == 'x' ? r : (r&0x3|0x8);
            return v.toString(16);
        });

        let origLabel = setLabel('Creating...', 'initializing');
        opts.properties = Object.assign({}, opts.properties);

        this._geoJson= opts.geoJSON || {
            id:guid,
            type:'Feature',
            geometry:null,
            properties:{
                label:origLabel,
                ...opts.properties,
            },
        }
        this._geoJson.properties.strokeColor && 
            (this._geoJson.properties.strokeColor = new paper.Color(this._geoJson.properties.strokeColor))
        this._geoJson.properties.fillColor && 
            (this._geoJson.properties.fillColor = new paper.Color(this._geoJson.properties.fillColor))
        // this._geoJson.properties.rescale&&this._geoJson.properties.rescale.strokeWidth!==undefined&&
        //     (this._geoJson.properties.strokeWidth = Paper.scaleByCurrentZoom(this._geoJson.properties.rescale.strokeWidth))


        this.label = function(){ return _this._geoJson.properties.label; }

        el.data({feature:_this});
        el.find('.glyphicon-trash').on('click', function(ev){
            //do not let the event bubble up to change selected FeatureCollection
            ev.stopPropagation();
            ev.preventDefault();
            //clean up UI element
            let parent=el.parent();
            el.remove();
            parent.trigger('child-feature-removed');
            //clean up paperItem
            _this.paperItem.deselect();
            _this.paperItem.remove();
        });
        el.find('.bounding-element').on('click', function(ev){
            ev.stopPropagation();
            $(this).toggleClass('active');
            let isActive = $(this).hasClass('active');
            _this.paperItem.isBoundingElement = isActive;
        });
        el.find('.feature-item.name.edit').text(_this.label()).on('value-changed',function(ev,val){
            setLabel(val,'user-defined');
        });
        el.on('click',function(ev){
            ev.stopPropagation();
            Paper.toggleItemSelection(_this.paperItem,(ev.metaKey || ev.ctrlKey));
        })
        el.find('.editablecontent .glyphicon-edit').on('click', function(ev){
            ev.stopPropagation();
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
        el.on('focusout','.editablecontent.editing .edit', function(){
            let parent=$(this).closest('.editablecontent');
            let oldtext = $(this).data('previous-text');
            let newtext = $(this).text().trim();
            if(newtext !== oldtext) parent.find('.edit').trigger('value-changed',newtext);
            parent.removeClass('editing');
            $(this).removeAttr('contenteditable').text(newtext);
        });
        el.on('keypress','.editablecontent.editing .edit', function(ev){
            ev.stopPropagation();
            if(ev.which==13){
                ev.preventDefault();
                $(this).blur();
            }
        });
        el.on('keydown keyup','.editablecontent.editing .edit',function(ev){ev.stopPropagation()})
        
        this.element = el;

        this.paperItem = Paper.fromGeoJSON(this._geoJson);
        this.paperItem.on({
            'selected':function(ev){ el.addClass('selected').trigger('selected'); },
            'deselected':function(ev){ el.removeClass('selected').trigger('deselected'); },
            'selection:mouseenter':function(){el.addClass('item-hovered')},
            'selection:mouseleave':function(){el.removeClass('item-hovered')},
        });
        
        
        //add function to paperItem to handle replacing this with a modified paperjs item
        this.paperItem.replace=(function(_this){
            return function (newItem){
                newItem._callbacks = _this.paperItem._callbacks; 
                newItem.toGeoJSON = _this.paperItem.toGeoJSON || newItem.toGeoJSON;
                newItem.replace = _this.paperItem.replace;
                
                //replace in the paper hierarchy
                _this.paperItem.replaceWith(newItem)
                // newItem.style = style;
                // ps.view.update();
                _this.paperItem.remove();
                ps.view.update();
                _this.paperItem = newItem;
                
                let geomType = (_this._geoJson.geometry.properties && _this._geoJson.geometry.properties.subtype) ||
                                _this._geoJson.geometry.type; 
                _this.ui.setLabel(geomType, 'geometry-type-changed');
                _this.paperItem.emit('updated');
                return _this.paperItem;
            };
        })(this);


        this.ui={
            setLabel:setLabel,
            name:function(){return el.find('.feature-item.name').text()},
            setFillColor:setFillColor,
            setStrokeColor:setStrokeColor,
            setStrokeWidth:setStrokeWidth,
        }

        if(!this._geoJson.properties.label){
            this.ui.setLabel(this._geoJson.geometry.type);
        }
        function setLabel(text,source='user-defined'){
            console.log('setting label',text,source);
            if( _this._geoJson && _this._geoJson.properties && 
                _this._geoJson.properties.label && _this._geoJson.properties.label.source=='user-defined' && 
                source!=='user-defined' ) return;

            let l = new String(text);
            l.source=source;
            _this._geoJson && (_this._geoJson.properties.label = l);
            el.find('.feature-item.name').text(l);//.trigger('value-changed',[l]);
            return l;
        }
        function setFillColor(c){
            _this.paperItem.fillColor && (_this.paperItem.fillColor = c);
            _this._geoJson.properties.fillColor=c;
        }
        function setStrokeColor(c){
            _this.paperItem.strokeColor = c; 
            _this._geoJson.properties.strokeColor=c;
        }
        function setStrokeWidth(w){
            _this.paperItem.strokeWidth = Paper.scaleByCurrentZoom(w);
            _this._geoJson.properties.strokeWidth = w;
            _this.paperItem.rescale && (_this.paperItem.rescale.strokeWidth = w)
            _this.paperItem.rescale && (_this._geoJson.properties.rescale.strokeWidth=w);
        }
    }

    

    
}

function makeFeatureElement(){
    let html = `
    <div class='feature'>
        <div class='editablecontent'>
            <span class='onhover glyphicon glyphicon-star bounding-element' title='Bounding element'></span>
            <span class='feature-item name edit'>Creating...</span>
            <span class='onhover glyphicon glyphicon-edit' title='Edit name'></span>
            <span class='onhover glyphicon glyphicon-trash' title='Remove'></span>
        </div>
    </div>
    `;
    return $(html);
}