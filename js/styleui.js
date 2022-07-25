export class StyleUI{
    constructor(AnnotationPaper){
        let _this=this;
        if(!AnnotationPaper){
            error('Instance of AnnotationPaper must be passed in the constructor');
        }
        let Paper = AnnotationPaper;

        this.baseStyle = {
            fillColor:new paper.Color('white'),
            strokeColor:new paper.Color('black'),
            strokeWidth:1,
            rescale:{strokeWidth:1}
        }
        
        this.active = {collections:[],features:[]};
        this.element = $('<div>',{class:'style-toolbar'});
        
        this._label=$('<div>',{class:'style-active-item'}).appendTo(this.element);
        $('<span>',{class:'collection-label'}).appendTo(this._label).text('');
        $('<span>',{class:'feature-label'}).appendTo(this._label).text('');
        let toprow=$('<div>',{class:'toprow'}).appendTo(this.element);
        
        this._fill = $('<span>',{class:'btn btn-sm fill activate-colorpicker-bar trigger-colorpicker-action'}).appendTo(toprow);
        $('<span>').text('Fill ').appendTo(this._fill);
        $('<span>',{class:'preview'}).appendTo(this._fill);            
        
        this._stroke = $('<span>',{class:'btn btn-sm stroke activate-colorpicker-bar trigger-colorpicker-action'}).appendTo(toprow);
        $('<span>').text('Stroke ').appendTo(this._stroke);
        $('<span>',{class:'preview'}).appendTo(this._stroke);
        
        this._swinput = $('<input>',{type:'number',min:0,value:1}).on('input',function(){
            _this.setStrokeWidth($(this).val(),{apply:'active'})
        })
        $('<span>',{class:'stroke-width'}).appendTo(toprow).append($('<span>').text(' Weight: ')).append(this._swinput);

        let cp = $('<div>',{class:'colorpicker-bar activate-colorpicker-bar'}).appendTo(this.element);
        let cinput= $('<input>',{type:'color',class:'set-default default-action'}).on('input',function(){
            cp.data('currentAction').call(_this,cinput.val(),{apply:'active'});
        })
        $('<span>').appendTo(cp).append($('<span>').text('Pick: ')).append(cinput);
        let fromImage=$('<span>',{class:'btn btn-sm'}).text('From image').appendTo(cp);
        fromImage.on('click',function(){
            Paper.pickColor().then( (
                function(action){ return function(c){ 
                    action.call(_this,c,{apply:'active'});
                    _this.element.find('.active-button').trigger('click'); 
                }
            })(cp.data('currentAction')) ) 
        });
        let fromAverage=$('<span>',{class:'btn btn-sm'}).text('Area average').appendTo(cp);
        fromAverage.on('click',function(){
            let items = _this.active.features.concat(_this.active.collections);
            items.forEach(item=>{
                Paper.getAverageColor(item.paperItem || item.paperGroup.group).then( (
                    function(action,item){ return function(c){ 
                        action.call(_this,c,{apply:item});
                        _this.element.find('.active-button').trigger('click'); 
                    }
                })(cp.data('currentAction'),item) ) 
            })
            
        });

        this._fill.on('click',function(){
            let c = new paper.Color(_this._fill.find('.preview').css('backgroundColor'));
            cp.find('input[type="color"]').val(c.toCSS(true));
            cp.data({'currentAction':_this.setFillColor,'active-button':_this._fill});
            _this._fill.addClass('active-button');
            _this._stroke.removeClass('active-button');
        }).trigger('click');//make fill the default colorpicker

        this._stroke.on('click',function(){
            let c = new paper.Color(_this._stroke.find('.preview').css('backgroundColor'));
            cp.find('input[type="color"]').val(c.toCSS(true));               
            cp.data({'currentAction':_this.setStrokeColor,'active-button':_this._stroke});
            _this._stroke.addClass('active-button');
            _this._fill.removeClass('active-button');
        });
        this.updateDisplay();
    }
    addActiveFeature(feature){ this.active.features.indexOf(feature)==-1 && this.active.features.push(feature);this.updateDisplay(); }
    removeActiveFeature(feature){ let i =this.active.features.indexOf(feature); i>-1&&this.active.features.splice(i,1);this.updateDisplay(); }
    addActiveCollection(collection){ this.active.collections.indexOf(collection)==-1&&this.active.collections.push(collection);this.updateDisplay(); }
    removeActiveCollection(collection){ let i =this.active.collections.indexOf(collection); i>-1&&this.active.collections.splice(i,1);this.updateDisplay(); }
    getBaseStyle(){ return this.baseStyle; }
    setFillOpacity(o){ this._fillOpacity=o; this.baseStyle.fillColor.alpha=o;}
    setFillColor(color,opts={apply:false}){
        color = new paper.Color(color);
        color.alpha=1;
        this._fill.find('.preview').css({backgroundColor:color.toCSS()});
        color.alpha = this._fillOpacity;
        if(opts.apply){
            let items = opts.apply=='active'? [].concat(this.active.features,this.active.collections):[].concat(opts.apply);
            items.forEach(f=>f.ui.setFillColor(new paper.Color(color)));
            if(items.length==0 && opts.apply=='active')this.baseStyle.fillColor=color;
        }
        
    }
    setStrokeColor(color,opts={apply:false}){
        color = new paper.Color(color);
        color.alpha=1;
        this._fill.find('.preview').css({borderColor:color.toCSS()});
        this._stroke.find('.preview').css({backgroundColor:color.toCSS()});
        if(opts.apply){
            let items = opts.apply=='active'? [].concat(this.active.features,this.active.collections):[].concat(opts.apply);
            items.forEach(f=>f.ui.setStrokeColor(new paper.Color(color)));
            if(items.length==0 && opts.apply=='active')this.baseStyle.strokeColor=color;
        }
        
    }
    setStrokeWidth(w,opts={apply:false}){
        w = parseFloat(w);
        this._stroke.find('.preview').css({height:(2*w)+'px'});
        if(opts.apply){
            let items = opts.apply=='active'? [].concat(this.active.features,this.active.collections):[].concat(opts.apply);
            items.forEach(f=>f.ui.setStrokeWidth(w));
            if(items.length==0 && opts.apply=='active'){
                this.baseStyle.strokeWidth=w;
                this.baseStyle.rescale.strokeWidth=w;
            }
        }
        
    }
    updateDisplay(){

        let numCollections=this.active.collections.length;
        let numFeatures=this.active.features.length;

        let collectionLabel = numCollections==0?'No collections':numCollections==1?this.active.collections[0].label():`${numCollections} collections`;
        let featureLabel = numFeatures==0?'No features':numFeatures==1?this.active.features[0].label():`${numFeatures} features`;
        if(numCollections + numFeatures == 0){
            collectionLabel='';
            featureLabel='';
        }
        this._label.find('.collection-label').text(collectionLabel);
        this._label.find('.feature-label').text(featureLabel);


        let item=this.active.features.slice(-1)[0] || this.active.collections.slice(-1)[0];
        let d = item ? item._geoJson.properties : this.baseStyle;
        
        if(d.fillColor) this.setFillColor(d.fillColor, false);
        if(d.strokeColor) this.setStrokeColor(d.strokeColor, false);
        if(d.hasOwnProperty('strokeWidth')){
            this._swinput.val(d.strokeWidth);
            this.setStrokeWidth(d.strokeWidth, false);
        }
        this.element.find('.active-button').trigger('click');//triggering this applies style to colorpicker too
    }
}