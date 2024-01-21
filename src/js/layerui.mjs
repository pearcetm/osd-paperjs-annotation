/**
 * OpenSeadragon paperjs overlay plugin based on paper.js
 * @version 0.3.0
 * 
 * Includes additional open source libraries which are subject to copyright notices
 * as indicated accompanying those segments of code.
 * 
 * Original code:
 * Copyright (c) 2022-2024, Thomas Pearce
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 * 
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 * 
 * * Neither the name of osd-paperjs-annotation nor the names of its
 *   contributors may be used to endorse or promote products derived from
 *   this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * 
 */


import { OpenSeadragon } from './osd-loader.mjs';
import { FeatureCollectionUI } from './featurecollectionui.mjs';

/**
 * A user interface for managing layers of feature collections.
 * @class
 * @memberof OSDPaperjsAnnotation
 * @extends OpenSeadragon.EventSource
 */
class LayerUI extends OpenSeadragon.EventSource{

    /**
     * Create a new LayerUI instance.
     * @constructor
     * @property {HTMLElement} element - The HTML element associated with the LayerUI instance. refer to typedef for subproperties
     * @param {AnnotationToolkit} annotationToolkit - The paper scope object.
     */
    constructor(annotationToolkit){
        super();
        let self=this;
        this._tk = annotationToolkit
        this.paperScope = this._tk.paperScope;
        this.paperScope.project.on('feature-collection-added',ev=>this._onFeatureCollectionAdded(ev));
        
        self.element = makeHTMLElement();
        
        
        self.element.find('.new-feature-collection').on('click',function(ev){
            ev.stopPropagation();
            ev.preventDefault();
            self._tk.addEmptyFeatureCollectionGroup();
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
                fg.group.bringToFront();
            })
        }})

        
        //set up delegated events

        self.element.on('selected','.feature',function(ev){
            ev.stopPropagation();
            $(this).addClass('selected');
            this.scrollIntoView({block:'nearest'});
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
        /**
         * Set the opacity of the feature collections.
         * @private
         * @param {number} o - The opacity value between 0 and 1.
         */
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
    /**
     * Hide the layer UI element.
     * 
     */
    hide(){
        this.element.hide();
        this.raiseEvent('hide');
    }
    /**
     * Show the layer UI element.
     * 
     */
    show(){
        this.element.show();
        this.raiseEvent('show');
    }
    /**
     * Toggle the visibility of the layer UI element.
     */
    toggle(){
        this.element.is(':visible') ? this.hide() : this.show();
    }
    /**
     * Deactivate the layer UI element.
     */
    deactivate(){
        this.element.addClass('deactivated');
    }
    /**
     * Activate the layer UI element.
     */
    activate(){
        this.element.removeClass('deactivated');
    }
    /**
     * Destroy the layer UI element.
     */
    destroy(){
        this.raiseEvent('destroy');
        this.element.remove();
    }
    

    /**
     * Handle the feature collection added event.
     * @param {object} ev - The event object.
     * @private
     * 
     */
    _onFeatureCollectionAdded(ev){
        let grp = ev.group;
        
        let fc=new FeatureCollectionUI(grp, {guiSelector:`[data-ui-id="${this.element.data('ui-id')}"]`});
        this.element.find('.annotation-ui-feature-collections').append(fc.element).sortable('refresh');
        fc.element.dispatchEvent(new Event('element-added'));
        setTimeout(function(){fc.element.classList.add('inserted'); }, 30);//this allows opacity fade-in to be triggered

    }
    
    

}
export{LayerUI};
/**
 *  Create an HTML element for the layer UI.
 * @private
 * @returns {jQuery} The jQuery object of the HTML element.
 */
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

