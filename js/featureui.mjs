import {EditableContent} from './utils/editablecontent.mjs';
export class FeatureUI{
    constructor(paperItem){
        
        let self=this;
        this.paperItem=paperItem;
        let el = this._element = makeFeatureElement();
        this.paperItem.FeatureUI = this;
        this._editableName = new EditableContent();
        el.find('.feature-item.name').empty().append(this._editableName.element);
        this._editableName.onChanged = function(text){
            self.setLabel(text,'user-defined');
        };
        
        // let guid= 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c) {
        //     let r = Math.random() * 16|0;
        //     let v = c == 'x' ? r : (r&0x3|0x8);
        //     return v.toString(16);
        // });

        
        el.data({feature:self});
        el.find('[data-action]').on('click', function(ev){
            //don't bubble up
            ev.stopPropagation();
            ev.preventDefault();
            let action = $(ev.target).data('action');
            switch(action){
                case 'trash': self.removeItem(); break;
                case 'edit': self.editClicked(); break;
                case 'bounds': self.useAsBoundingElement(); break;
                case 'style':self.openStyleEditor(ev); break;
                case 'zoom-to':self.centerItem(); break;
                default: console.log('No function set for action:',action);
            }
            
        });
        
        // $(this._editableName.element).on('value-changed',function(ev,val){
        //     self.setLabel(val,'user-defined');
        // });
        el.on('click',function(ev){
            ev.stopPropagation();
            self.paperItem.toggle((ev.metaKey || ev.ctrlKey));
        })

        
        
        // el.on('focusout','.editablecontent.editing .edit', function(){
        //     let parent=$(this).closest('.editablecontent');
        //     let oldtext = $(this).data('previous-text');
        //     let newtext = $(this).text().trim();
        //     if(newtext !== oldtext) parent.find('.edit').trigger('value-changed',newtext);
        //     parent.removeClass('editing');
        //     $(this).removeAttr('contenteditable').text(newtext);
        // });
        // el.on('keypress','.editablecontent.editing .edit', function(ev){
        //     ev.stopPropagation();
        //     if(ev.which==13){
        //         ev.preventDefault();
        //         $(this).blur();
        //     }
        // });
        // el.on('keydown keyup','.editablecontent.editing .edit',function(ev){ev.stopPropagation()})
        
        this.element = el;
        this.paperItem.on({
            'selected':function(){ el.addClass('selected').trigger('selected'); },
            'deselected':function(){ el.removeClass('selected').trigger('deselected'); },
            'selection:mouseenter':function(){el.addClass('item-hovered')},
            'selection:mouseleave':function(){el.removeClass('item-hovered')},
            'item-replaced':function(ev){
                // console.log('item-replaced',ev);
                //check label first because it is dynamically fetched from the referenced this.paperItem object
                if(self.label.source=='user-defined'){
                    ev.item.displayName = self.label;
                }
                self.paperItem = ev.item;
                self.paperItem.FeatureUI=self;
                self.updateLabel();
            },
            'display-name-changed':function(ev){
                self.updateLabel();
            },
            'removed':function(ev){
                if(ev.item == self.paperItem){
                    self.remove();
                }
            }
        });

        if(this.paperItem.selected){
            this.paperItem.emit('selected');
        }

        this.label ? this.updateLabel() : this.setLabel('Creating...', 'initializing');
        
    }
    get label(){
        return this.paperItem.displayName;
    }
    set label(l){
        return this.setLabel(l)
    }
    setLabel(text,source){
        let l = new String(text);
        l.source=source;
        this.paperItem.displayName = l;
        this.updateLabel();
        return l;
    }
    updateLabel(){
        // this._element.find('.feature-item.name').text(this.label);//.trigger('value-changed',[l]);
        this._editableName.setText(this.label);
    }
    removeItem(){        
        //clean up paperItem
        this.paperItem.remove();
        this.paperItem.deselect();
    }
    remove(){
        this._element.remove().trigger('removed');
    }
    editClicked(){
        let header = this._element.find('.editablecontent');
        header.addClass('editing');
        let ce = header.find('.edit').attr('contenteditable',true).focus();
        ce.data('previous-text',ce.text());
        let range = document.createRange();
        range.selectNodeContents(ce[0]);
        let selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }
    useAsBoundingElement(toggle=false){
        if(!this.paperItem.canBeBoundingElement) return false;
        let element = this._element.find('[data-action="bounds"]');
        if(toggle){
            element.find('[data-action="bounds"]').toggleClass('active');
        } else {
            element.find('[data-action="bounds"]').addClass('active');
        }
        let isActive = element.hasClass('active');
        this.paperItem.isBoundingElement = isActive;
        return isActive;
    }    
    openStyleEditor(){
        let heard = this.paperItem.project.emit('edit-style',{item:this.paperItem});
        if(!heard){
            console.warn('No event listeners are registered for paperScope.project for event \'edit-style\'');
        }
    }
    centerItem(immediately = false){
        let viewport = this.paperItem.project.overlay.osdViewer.viewport;
        let bounds = this.paperItem.bounds;
        let center = viewport.imageToViewportCoordinates(bounds.center.x,bounds.center.y);
        let scale=1.5;
        let xy = viewport.imageToViewportCoordinates(bounds.center.x - bounds.width/scale, bounds.center.y - bounds.height/scale);
        let wh = viewport.imageToViewportCoordinates(2*bounds.width/scale, 2*bounds.height/scale);
        let rect=new OpenSeadragon.Rect(xy.x, xy.y, wh.x,wh.y);
        let vb = viewport.getBounds();
        if(rect.width > vb.width || rect.height > vb.height){
            viewport.fitBounds(rect, immediately);
        }
        else{
            viewport.panTo(center, immediately);
        }
        // console.log('centerItem clicked',rect)
    }
    
}

function makeFeatureElement(){
    let html = `
    <div class='feature'>
        <div class='hoverable-actions'>
            <span class='onhover fa-solid fa-crop-simple bounding-element' data-action="bounds" title='Bounding element'></span>
            <span class='feature-item name'></span>
            <span class='onhover fa-solid fa-palette' data-action='style' title='Open style editor'></span>
            <span class='onhover fa-solid fa-binoculars' data-action='zoom-to' title='View this feature'></span>
            <span class='onhover fa-solid fa-trash-can' data-action='trash' title='Remove'></span>
        </div>
    </div>
    `;
    return $(html);
}