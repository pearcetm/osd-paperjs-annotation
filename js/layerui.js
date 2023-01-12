// import { FeatureUI } from './featureui.js';
import { FeatureCollectionUI } from './featurecollectionui.js';

export class LayerUI{

    constructor(paperScope){
        let self=this;
        
        this.paperScope = paperScope;
        this.paperScope.project.on('feature-collection-added',ev=>this._onFeatureCollectionAdded(ev));
        
        self.element = makeHTMLElement();
        
        //make this an event source
        OpenSeadragon.extend(LayerUI.prototype, OpenSeadragon.EventSource.prototype);
        OpenSeadragon.EventSource.call(this);
        
        self.element.find('.new-feature-collection').on('click',function(ev){
            ev.stopPropagation();
            ev.preventDefault();
            // self.addFeatureCollection();
            self.paperScope.createFeatureCollectionLayer();
        });
        self.element.find('.toggle-annotations').on('click',function(ev){
            let hidden = self.element.find('.annotation-ui-feature-collections .feature-collection.annotation-hidden');
            if(hidden.length > 0) hidden.find('[data-action="show"]').trigger('click');
            else self.element.find('.annotation-ui-feature-collections .feature-collection:not(.hidden) [data-action="hide"]').trigger('click');
        });


        //setup sortable featurecollection interface
        self.element.find('.annotation-ui-feature-collections').sortable({contain:'parent',update:function(){
            self.element.find('.annotation-ui-feature-collections .feature-collection').each(function(idx,g){
                let fg = $(g).data('featureCollection');
                fg.layer.bringToFront();
            })
        }})

        
        //set up delegated events

        self.element.on('selected','.feature',function(ev){
            ev.stopPropagation();
            $(this).addClass('selected');
            this.scrollIntoViewIfNeeded();
        });
        self.element.on('deselected','.feature',function(ev){
            ev.stopPropagation();
            $(this).removeClass('selected');
        });

        
        self.element.on('click','.toggle-list',function(ev){
            $(this).closest('.features').toggleClass('collapsed');
            ev.stopPropagation();
        });
        
        self.element.on('value-changed',function(){
            let el = $(this);
            console.log('value-changed',el);
            self.element.find('.feature.selected').trigger('selected');
            self.element.find('.feature-collection.active').trigger('selected');
        });

        self.element.find('input.annotation-total-opacity').on('input',function(){
            setOpacity(this.value);
        }).trigger('input');

        self.element.find('input.annotation-fill-opacity').on('input',function(){
            self.paperScope.view.fillOpacity = this.value;
        }).trigger('input');

        function setOpacity(o){
            let status = self.element.find('.feature-collection').toArray().reduce(function(ac,el){
                el = $(el)
                if( el.hasClass('selected') ){
                    ac.selected.push(el);
                }
                else if( el.is(':hover,.svg-hovered')){
                    ac.hover.push(el);
                }
                else{
                    ac.other.push(el);
                }
                return ac;
            },{selected:[],hover:[],other:[]});
            if(status.selected.length>0){
                status.selected.forEach(function(el){
                    let opacity=1 * o;
                    let fc=$(el).data('featureCollection');
                    fc&&fc.ui.setOpacity(opacity)
                })
                status.hover.concat(status.other).forEach(function(el){
                    let opacity=0.25 * o;
                    let fc=$(el).data('featureCollection');
                    fc&&fc.ui.setOpacity(opacity)
                })
            }
            else if(status.hover.length>0){
                status.hover.forEach(function(el){
                    let opacity=1 * o;
                    let fc=$(el).data('featureCollection');
                    fc&&fc.ui.setOpacity(opacity)
                })
                status.other.forEach(function(el){
                    let opacity=0.25 * o;
                    let fc=$(el).data('featureCollection');
                    fc&&fc.ui.setOpacity(opacity)
                })
            }
            else{
                status.other.forEach(function(el){
                    let opacity=1 * o;
                    let fc=$(el).data('featureCollection');
                    fc&&fc.ui.setOpacity(opacity)
                })
            }
        }
        
    }
    hide(){
        this.element.hide();
        this.raiseEvent('hide');
    }
    show(){
        this.element.show();
        this.raiseEvent('show');
    }
    toggle(){
        this.element.is(':visible') ? this.hide() : this.show();
    }
    
    deactivate(){
        this.element.addClass('deactivated');
    }
    activate(){
        this.element.removeClass('deactivated');
    }
    
    destroy(){
        this.raiseEvent('destroy');
        this.element.remove();
    }
    
    //private
    _onFeatureCollectionAdded(ev){
        let layer = ev.layer;
        
        let fc=new FeatureCollectionUI(layer, {guiSelector:`[data-ui-id="${this.element.data('ui-id')}"]`});
        this.element.find('.annotation-ui-feature-collections').append(fc.element).sortable('refresh');
        fc.element.trigger('element-added');
        setTimeout(function(){fc.element.addClass('inserted'); }, 30);//this allows opacity fade-in to be triggered

    }
    
    

}
function makeHTMLElement(){
    let html = `
        <div class="annotation-ui-mainwindow" title="Annotations">
            <div class='annotation-ui-toolbar annotation-visibility-controls'>                
                <div class="visibility-buttons btn-group btn-group-sm disable-when-deactivated" role="group">
                    <button class="btn btn-default toggle-annotations" type="button" title="Toggle annotations">
                        <span class="glyphicon glyphicon-eye-open fa fa-eye"></span><span class="glyphicon glyphicon-eye-close fa fa-eye-slash"></span>
                    </button>
                </div>
                <span class="annotation-opacity-container disable-when-annotations-hidden" title="Change total opacity">
                    <input class="annotation-total-opacity" type="range" min="0" max="1" step="0.01" value="1">
                </span>
                <span class="annotation-opacity-container disable-when-annotations-hidden" title="Change fill opacity">
                    <input class="annotation-fill-opacity" type="range" min="0" max="1" step="0.01" value="0.25">
                </span>
            </div>
            <div class='annotation-ui-toolbar disable-when-deactivated disable-when-annotations-hidden'>
                <label>Feature Collections:</label>
            </div>
            <div class='annotation-ui-feature-collections disable-when-annotations-hidden disable-when-deactivated'></div>
            <div class='new-feature-collection disable-when-deactivated'><span class='glyphicon glyphicon-plus fa fa-plus'></span>Add Feature Collection</div>
        </div>`;
    let element = $(html);
    let guid= 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c) {
        let r = Math.random() * 16|0;
        let v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
    element.attr('data-ui-id',guid);
    return element;
}