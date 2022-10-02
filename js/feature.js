export class Feature{
    constructor(paperItem,opts={toolbar:null}){
        
        let self=this;
        this.paperItem=paperItem;
        let el = this._element = makeFeatureElement();
        this.toolbar = opts.toolbar;
        
        let guid= 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c) {
            let r = Math.random() * 16|0;
            let v = c == 'x' ? r : (r&0x3|0x8);
            return v.toString(16);
        });

        
        el.data({feature:self});
        el.find('[data-action]').on('click', function(ev){
            //don't bubble up
            ev.stopPropagation();
            ev.preventDefault();
            let action = $(ev.target).data('action');
            switch(action){
                case 'trash': self.trashClicked(); break;
                case 'edit': self.editClicked(); break;
                case 'bounds': self.boundsClicked(); break;
                case 'style':self.styleClicked(ev); break;
                case 'zoom-to':self.zoomClicked(); break;
                default: console.log('No function set for action:',action);
            }
            
        });
        
        el.find('.feature-item.name.edit').text(self.label).on('value-changed',function(ev,val){
            self.setLabel(val,'user-defined');
        });
        el.on('click',function(ev){
            ev.stopPropagation();
            self.paperItem.toggle((ev.metaKey || ev.ctrlKey));
        })
        
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

        this.paperItem.on({
            'selected':function(ev){ el.addClass('selected').trigger('selected'); },
            'deselected':function(ev){ el.removeClass('selected').trigger('deselected'); },
            'selection:mouseenter':function(){el.addClass('item-hovered')},
            'selection:mouseleave':function(){el.removeClass('item-hovered')},
            'item-replaced':function(ev){
                // console.log('item-replaced',ev);
                //check label first because it is dynamically fetched from the referenced this.paperItem object
                if(self.label.source=='user-defined'){
                    ev.item.displayName = self.label;
                }
                self.paperItem = ev.item;
                self.updateLabel();
            },
            'display-name-changed':function(ev){
                self.updateLabel();
            },
        });

        this.label || this.setLabel('Creating...', 'initializing');
        
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
        this._element.find('.feature-item.name').text(this.label);//.trigger('value-changed',[l]);
    }
    trashClicked(){
        let parent=this._element.parent();
        this._element.remove();
        
        //clean up paperItem
        this.paperItem.remove();
        this.paperItem.deselect();

        parent.trigger('child-feature-removed');
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
    boundsClicked(){
        if(!this.paperItem.canBeBoundingElement) return;
        let isActive = this._element.find('[data-action="bounds"]').toggleClass('active').hasClass('active');
        this.paperItem.isBoundingElement = isActive;
    }    
    styleClicked(){
        this.toolbar && this.toolbar.tools.style.activateForItem(this.paperItem);
    }
    zoomClicked(){
        let viewport = this.paperItem.project.overlay.osdViewer.viewport;
        let bounds = this.paperItem.bounds;
        let center = viewport.imageToViewportCoordinates(bounds.center.x,bounds.center.y);
        let scale=1.5;
        let xy = viewport.imageToViewportCoordinates(bounds.center.x - bounds.width/scale, bounds.center.y - bounds.height/scale);
        let wh = viewport.imageToViewportCoordinates(2*bounds.width/scale, 2*bounds.height/scale);
        let rect=new OpenSeadragon.Rect(xy.x, xy.y, wh.x,wh.y);
        let vb = viewport.getBounds();
        if(rect.width > vb.width || rect.height > vb.height){
            viewport.fitBounds(rect);
        }
        else{
            viewport.panTo(center);
        }
        console.log('zoom clicked',rect)
    }
    
}

function makeFeatureElement(){
    let html = `
    <div class='feature'>
        <div class='editablecontent'>
            <span class='onhover fa-solid fa-crop-simple bounding-element' data-action="bounds" title='Bounding element'></span>
            <span class='feature-item name edit'>Creating...</span>
            <span class='onhover fa fa-edit' data-action='edit' title='Edit name'></span>
            <span class='onhover fa-solid fa-palette' data-action='style' title='Open style editor'></span>
            <span class='onhover fa-solid fa-binoculars' data-action='zoom-to' title='View this feature'></span>
            <span class='onhover fa-solid fa-trash-can' data-action='trash' title='Remove'></span>
        </div>
    </div>
    `;
    return $(html);
}