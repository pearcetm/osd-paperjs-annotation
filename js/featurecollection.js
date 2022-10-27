import { Feature } from './feature.js';
import { AnnotationItemPlaceholder } from './paperitems/annotationitemplaceholder.js';

export class FeatureCollection{
    constructor(paperObjects,init){
        let self=this;
        this.toolbar = init.toolbar;
        this.element = makeFeatureCollectionElement();
        
        this._featurelist=this.element.find('.features-list');
        this._featurelist.sortable({
            contain:'parent',
            connectWith:`${init.guiSelector} .features-list`,
            update:function(){
                self._featurelist.children().each(function(idx,c){
                    self.paperObjects.group.addChild($(c).data('feature').paperItem);
                })
            },
        });
        this.paperObjects = paperObjects;
        this.paperObjects.layer.on({
            'selection:mouseenter':function(){self.element.addClass('svg-hovered').trigger('mouseover')},
            'selection:mouseleave':function(){self.element.removeClass('svg-hovered').trigger('mouseout')},
            'selected':function(){self.element.addClass('selected').trigger('selected')},
            'deselected':function(){self.element.removeClass('selected').trigger('deselected')},
            'display-name-changed':function(ev){
                self.updateLabel();
            },
        });


        this.features = function(){
            return self._featurelist.find('.feature').map(function(_,el){
                return $(el).data('feature');
            }).toArray();
        }
        // this.toGeoJSON = function(){
        //     console.log('FeatureCollection.toGeoJSON',self.label);
        //     // self._geoJson.properties = self.paperObjects.layer.defaultStyle;
        //     self._geoJson.features = this.features().map(function(f){
        //         let gj = f._geoJson;
        //         gj.geometry = f.paperItem.toGeoJSONGeometry();
        //         gj.properties.fillColor && gj.properties.fillColor.toCSS &&(gj.properties.fillColor = gj.properties.fillColor.toCSS());
        //         gj.properties.strokeColor && gj.properties.strokeColor.toCSS && (gj.properties.strokeColor = gj.properties.strokeColor.toCSS());
        //         return gj;
        //     });
        //     return self._geoJson;
        // }
        this.remove = function(){
            self.paperObjects.layer.remove();
            self.element.remove();
        }
        this.numFeatures = function(){
            return self.features().length;
        }

        this.addFeature=function(f){
            self.paperObjects.group.addChild(f.paperItem);
            f.paperItem.updateFillOpacity();
            self._featurelist.append(f.element);
            self._featurelist.sortable('refresh');
            return f.element; 
        }
        this.createFeature=function(){
            //create a new feature
            let props = this.paperObjects.layer.defaultStyle;
            let clonedProperties = {
                fillColor:new paper.Color(props.fillColor),
                strokeColor:new paper.Color(props.strokeColor),
                rescale:$.extend(true,{},props.rescale),
                fillOpacity:props.fillOpacity,
                strokeOpacity:props.strokeOpacity,
                strokeWidth:props.strokeWidth,
            }
            // let style = new paper.Style(Object.assign({},props,clonedProperties));
            let style = new paper.Style(clonedProperties);
            let placeholder = new AnnotationItemPlaceholder(style);
            let f = new Feature(placeholder,{toolbar:this.toolbar});
            return this.addFeature(f);
        }

        this.ui={
            setOpacity:setOpacity,
            setFillOpacity:setFillOpacity,
        }

        function setOpacity(o){
            self.paperObjects.layer.opacity = o;
        }
        function setFillOpacity(o){
            self.paperObjects.layer.fillOpacity = o;
        }
        
        //action handling and data binding
        self.element.data({featureCollection:self});
        self.element.find('.annotation-header .annotation-name.edit').on('value-changed',function(ev,val){
            self.label = val;
        });
        self.label = this.paperObjects.layer.displayName;



        self._featurelist.sortable('refresh');

        self.element.on('click',function(ev){
            ev.stopPropagation();
            // Toolkit.toggleLayerSelection(_this.paperObjects.layer);
        })
        // self.element.find('.visibility-toggle').on('click',function(ev){
        //     ev.stopPropagation();
        //     ev.preventDefault();
        //     self.element.toggleClass('annotation-hidden');
        //     self.paperObjects.layer.visible = !self.element.hasClass('annotation-hidden');
        // });
        self.element.find('.toggle-list').on('click',function(ev){
            let numFeatures = self._featurelist.children().length;
            self.element.find('.num-annotations').text(numFeatures);
            self.element.find('.features-summary').attr('data-num-elements',numFeatures);
            self.element.find('.features').toggleClass('collapsed');
            ev.stopPropagation();
            ev.preventDefault();
        });

        self.element.find('.annotation-header [data-action]').on('click',function(ev){
            //don't bubble up
            ev.stopPropagation();
            ev.preventDefault();
            let action = $(ev.target).data('action');
            switch(action){
                case 'trash': self.trashClicked(); break;
                case 'edit': self.editClicked(); break;
                case 'style': self.styleClicked(ev); break;
                case 'show': self.toggleVisibility(); break;
                case 'hide': self.toggleVisibility(); break;
                default: console.log('No function set for action:',action);
            }
            
        });
        self.element.find('.new-feature').on('click',function(ev){
            ev.stopPropagation();
            let el = self.createFeature();
            $(this).trigger('element-added');
            el.trigger('click');
        });

        self.element.on('focusout','.editablecontent.editing .edit', function(){
            let parent=$(this).closest('.editablecontent');
            let oldtext = $(this).data('previous-text');
            let newtext = $(this).text().trim();
            if(newtext !== oldtext) $(this).trigger('value-changed',newtext);
            parent.removeClass('editing');
            $(this).removeAttr('contenteditable').text(newtext);
        });
        self.element.on('keypress','.editablecontent.editing .edit', function(ev){
            ev.stopPropagation();
            if(ev.which==13){
                ev.preventDefault();
                $(this).blur();
            }
        });
        self.element.on('keydown keyup','.editablecontent.editing .edit',function(ev){ev.stopPropagation()})


        return this;
    }
    get label(){
        return this.paperObjects.layer.displayName;
    }
    // set label(label){
    //     this.element.find('.annotation-header .annotation-name.edit').text(label);
    //     this.paperObjects.group.displayName = this.paperObjects.layer.displayName = label;
    // }
    // get label(){
    //     return this.paperItem.displayName;
    // }
    set label(l){
        return this.setLabel(l)
    }
    setLabel(text,source){
        let l = new String(text);
        l.source=source;
        this.paperObjects.group.displayName = this.paperObjects.layer.displayName = l;
        this.updateLabel();
        return l;
    }
    updateLabel(){
        this.element.find('.annotation-header .annotation-name.edit').text(this.label);
    }
    toggleVisibility(){
        this.element.toggleClass('annotation-hidden');
        this.paperObjects.layer.visible = !this.element.hasClass('annotation-hidden');
    }
    trashClicked(){
        //if previously trashed, restore the paperItems
        // To Do: add option for user to choose whether to restore or permanently remove
        if(this.element.hasClass('trashed')){
            this.element.removeClass('trashed');
            this.features().map(function(f){
                this.paperObjects.group.addChild(f.paperItem);
                f.paperItem.deselect();//insert objects as deselected
            });
        }
        else{
            this.element.addClass('trashed');
            this.features().map(function(f){
                f.paperItem.remove();
                f.paperItem.deselect();//ensure items are deselected
            });
        }   
    }
    editClicked(){
        let header = this.element.find('.annotation-header');
        header.addClass('editing');
        let ce = header.find('.edit').attr('contenteditable',true).focus();
        ce.data('previous-text',ce.text());
        let range = document.createRange();
        range.selectNodeContents(ce[0]);
        let selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);  
    }
    styleClicked(ev){
        this.toolbar && this.toolbar.tools.style.activateForItem(this.paperObjects.layer);
    }
}

function makeFeatureCollectionElement(){
    let html = `
    <div class='feature-collection'>
        <div class='editablecontent annotation-header'>
            <span class="visibility-toggle"><span class="fa fa-eye" data-action="hide"></span><span class="fa fa-eye-slash" data-action="show"></span></span>
            <span class='annotation-name name edit'></span>
            <span class='onhover fa fa-edit' data-action="edit" title='Edit name'></span>
            <span class='onhover fa-solid fa-palette' data-action='style' title='Open style editor'></span>
            <span class='onhover fa-solid fa-trash-can' data-action='trash' title='Remove feature collection'></span>
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