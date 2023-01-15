import { FeatureUI } from './featureui.mjs';
import { EditableContent } from './utils/editablecontent.mjs';

export class FeatureCollectionUI{
    constructor(layer,init){
        let self=this;
        // this.toolbar = init.toolbar;
        this.element = makeFeatureCollectionElement();
        this._editableName = new EditableContent();
        this.element.find('.annotation-name.name').empty().append(this._editableName.element);
        this._editableName.onChanged=function(text){
            self.label = text;
        }

        this._featurelist=this.element.find('.features-list');
        this._featurelist.sortable({
            contain:'parent',
            connectWith:`${init.guiSelector} .features-list`,
            update:function(){
                self._featurelist.children().each(function(idx,c){
                    self.layer.addChild($(c).data('feature').paperItem);
                })
            },
        });
        this.layer = layer;
        this.layer.on({
            'selection:mouseenter':function(){self.element.addClass('svg-hovered').trigger('mouseover')},
            'selection:mouseleave':function(){self.element.removeClass('svg-hovered').trigger('mouseout')},
            'selected':function(){self.element.addClass('selected').trigger('selected')},
            'deselected':function(){self.element.removeClass('selected').trigger('deselected')},
            'display-name-changed':function(ev){
                self.updateLabel();
            },
            'removed':function(){
                self.remove();
            },
            'child-added':function(ev){
                let featureUI = ev.item._FeatureUI || new FeatureUI(ev.item);
                self._addFeature(featureUI);
            }
        });


        this.features = function(){
            return self._featurelist.find('.feature').map(function(_,el){
                return $(el).data('feature');
            }).toArray();
        }
        
        this.remove = function(){
            self.element.remove();
        }
        this.numFeatures = function(){
            return self.features().length;
        }

        this._addFeature=function(f){
            f.paperItem.updateFillOpacity();
            self._featurelist.append(f.element);
            self._sortableDebounce && window.clearTimeout(self._sortableDebounce);
            self._sortableDebounce = window.setTimeout(()=>$(`${init.guiSelector} .features-list .feature`).length>100 ? self._featurelist.sortable('disable') : self._featurelist.sortable('refresh'), 15);
            return f.element; 
        }
        this.createFeature=function(){
            //define a new feature
            let props = this.layer.defaultStyle;
            let clonedProperties = {
                fillColor:new paper.Color(props.fillColor),
                strokeColor:new paper.Color(props.strokeColor),
                rescale:$.extend(true,{},props.rescale),
                fillOpacity:props.fillOpacity,
                strokeOpacity:props.strokeOpacity,
                strokeWidth:props.strokeWidth,
            }
            let style = new paper.Style(clonedProperties);
            let geoJSON = {
                type:'Feature',
                geometry:null,
                properties:style,
            }
            let placeholder = paper.Item.fromGeoJSON(geoJSON);
            this.layer.addChild(placeholder);
            return placeholder;
        }

        this.ui={
            setOpacity:setOpacity,
            setFillOpacity:setFillOpacity,
        }

        function setOpacity(o){
            self.layer.opacity = o;
        }
        function setFillOpacity(o){
            self.layer.fillOpacity = o;
        }
        
        
        self.element.data({featureCollection:self});//bind reference to self to the element, for use with rearranging/sorting layers

        self.label = this.layer.displayName;

        self._featurelist.sortable('refresh');

        self.element.on('click',function(ev){
            ev.stopPropagation();
        })
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
                // case 'edit': self.editClicked(); break;
                case 'style': self.styleClicked(ev); break;
                case 'show': self.toggleVisibility(); break;
                case 'hide': self.toggleVisibility(); break;
                default: console.log('No function set for action:',action);
            }
            
        });
        self.element.find('.new-feature').on('click',function(ev){
            ev.stopPropagation();
            let item = self.createFeature();
            item.select();
        });

        return this;
    }
    get label(){
        return this.layer.displayName;
    }
    set label(l){
        return this.setLabel(l)
    }
    setLabel(text,source){
        let l = new String(text);
        l.source=source;
        this.layer.displayName = l;
        this.updateLabel();
        return l;
    }
    updateLabel(){
        this._editableName.setText(this.label);
    }
    toggleVisibility(){
        this.element.toggleClass('annotation-hidden');
        this.layer.visible = !this.element.hasClass('annotation-hidden');
    }
    trashClicked(){
        if(window.confirm('Remove this layer?')==true){
            this.layer.remove();
        } else {

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
        let heard = this.layer.project.emit('edit-style',{item:this.layer});
        if(!heard){
            console.warn('No event listeners are registered for paperScope.project for event \'edit-style\'');
        }
    }
}

function makeFeatureCollectionElement(){
    let html = `
    <div class='feature-collection'>
        <div class='annotation-header hoverable-actions'>
            <span class="visibility-toggle"><span class="fa fa-eye" data-action="hide"></span><span class="fa fa-eye-slash" data-action="show"></span></span>
            <span class='annotation-name name'></span>
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