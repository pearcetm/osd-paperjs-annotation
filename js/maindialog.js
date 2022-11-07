import { Feature } from './feature.js';
import { FeatureCollection } from './featurecollection.js';
import {FileDialog} from './filedialog.js';

export class MainDialog{

    constructor(paperScope, opts={filename:'',positioningElement:null,appendTo:'body',toolbar:null,}){
        let self=this;
        
        this.paperScope = paperScope;

        let positioningElement=opts.positioningElement? $(opts.positioningElement) : $('body');

        let fileDialog = new FileDialog(this,opts);
        
        self.element = makeMainDialogElement();
        let guid= 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c) {
            let r = Math.random() * 16|0;
            let v = c == 'x' ? r : (r&0x3|0x8);
            return v.toString(16);
        });
        self.element.attr('data-ui-id',guid);
        
        self.filename = opts.filename || 'Unnamed File';
        self.element.attr('title',self.filename);

        self.refresh=refreshDialogPosition;
        
        self.close = function(){self.element.dialog('close');}
        self.open = function(){self.element.dialog('open');}
        self.isOpen = function(){return self.element.dialog('isOpen');}
        self.toggle=function(){self.isOpen() ? self.close() : self.open();}
        self.deactivate = function(){self.element.addClass('deactivated')}
        self.activate = function(){self.element.removeClass('deactivated')}
        
        self.destroy = function(){
            self.element.dialog('destroy');
            self.element.remove();
        }
        self.addFeatureCollection = function(geoJSON={features:[]}){
            let paperObjects=self.paperScope.createFeatureCollectionLayer()
            geoJSON.properties && paperObjects.layer.defaultStyle.set(geoJSON.properties);

            let fc=new FeatureCollection(paperObjects, {guiSelector:`[data-ui-id="${guid}"]`,toolbar:opts.toolbar});
            self.element.find('.annotation-ui-feature-collections').append(fc.element).sortable('refresh');
            // fc.element.trigger('element-added');
            setTimeout(function(){fc.element.addClass('inserted'); }, 30);//this allows opacity fade-in to be triggered

            geoJSON.features && geoJSON.features.forEach(feature=>{
                let paperItem = paperScope.Item.fromGeoJSON(feature);
                let f = new Feature(paperItem,{toolbar:opts.toolbar});
                fc.addFeature(f);
            })
            return fc;
        }
        
        self.getFeatureCollections = function(includeTrashed=false){
            let selector = includeTrashed ? '.annotation-ui-feature-collections .feature-collection' :
                                            '.annotation-ui-feature-collections .feature-collection:not(.trashed)';

            return self.element.find(selector).toArray().map(function(e){
                return $(e).data('featureCollection');
            })
        }
        self.toGeoJSON = function(opts={asString:true,includeTrashed:false}){
            if(opts.includeTrashed){
                console.warn('includeTrashed is not currently supported')
            } 
            let collections = self.paperScope.project.toGeoJSON()
            return opts.asString ? JSON.stringify(collections) : collections;
        };
        self.loadGeoJSON = function(geoJSON,opts={replace:false}){
            if(opts.replace){
                self.getFeatureCollections(true).forEach(fc=>fc.remove())
            }
            geoJSON.forEach(function(fc){
                let f = self.addFeatureCollection(fc);
            })
            // self.setOpacity();
        }
        
        //add UI handlers
        // self.element.find('.show-all-annotations').on('click',function(){
        //     console.warn('setGlobalVisibility function not implemented yet')
        //     // annotationToolkit.setGlobalVisibility(true);
        //     //self.element.removeClass('disabled');
        // });
        // self.element.find('.hide-all-annotations').on('click',function(){
        //     console.warn('setGlobalVisibility function not implemented yet')
        //     // annotationToolkit.setGlobalVisibility(false);
        //     //self.element.addClass('disabled');
        // });
        self.element.find('.new-feature-collection').on('click',function(ev){
            ev.stopPropagation();
            ev.preventDefault();
            self.addFeatureCollection();
        });
        self.element.find('.toggle-annotations').on('click',function(ev){
            let hidden = self.element.find('.annotation-ui-feature-collections .feature-collection.annotation-hidden');
            // if(hidden.length > 0) hidden.find('.visibility-toggle').trigger('click');
            // else self.element.find('.annotation-ui-feature-collections .feature-collection:not(.hidden) .visibility-toggle').trigger('click');
            if(hidden.length > 0) hidden.find('[data-action="show"]').trigger('click');
            else self.element.find('.annotation-ui-feature-collections .feature-collection:not(.hidden) [data-action="hide"]').trigger('click');
        });


        //setup sortable featurecollection interface
        self.element.find('.annotation-ui-feature-collections').sortable({contain:'parent',update:function(){
            self.element.find('.annotation-ui-feature-collections .feature-collection').each(function(idx,g){
                let fg = $(g).data('featureCollection');
                fg.paperObjects.layer.bringToFront();
            })
        }})

        //setup jqueryUI dialog object
        self.element.dialog({
            open:onOpen,
            resize:limitHeight,
            autoOpen:false,
            closeOnEscape:false,
            height:'auto',
            appendTo:opts.appendTo,
        });
        self.element.closest('.ui-dialog').draggable('option','containment','parent')
        let fb=$('<button>',{class:'file-button'}).text('File').prependTo(self.element.dialog('instance').classesElementLookup['ui-dialog-title'])
        .on('click',function(){
            fileDialog.dialog('open');
            self.saveHandler && self.saveHandler();       
        });
        fb.button({
            showLabel:true,
        })

        self.element.on('element-added',function(ev){
            let el = $(ev.target);
            self.refresh(el);
        })
        
        //set up delegated events

        self.element.on('selected','.feature',function(ev){
            ev.stopPropagation();
            let feature = $(this).addClass('selected').data('feature');
        });
        self.element.on('deselected','.feature',function(ev){
            ev.stopPropagation();
            let feature = $(this).removeClass('selected').data('feature');
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
        function refreshDialogPosition(scrolltoelement){
            let pos = self.element.dialog('option','position');
            positionDialog(pos);
            scrolltoelement && setTimeout(()=>{
                //scrolltoelement[0].scrollIntoView(false)
                scrolltoelement[0].scrollIntoView({block: "nearest", inline: "nearest"})
            }, 0);
        }
        function onOpen(){
            positionDialog();
        }
        
        function positionDialog(pos){
            let defaultPos={my:'right top', at:'right top', of:positioningElement}
            if(positioningElement.hasClass('navigator')){
                defaultPos={my:'right top', at:'right bottom', of:positioningElement}
            }
            
            pos = pos || defaultPos;

            self.element.dialog('option','position',pos);
            window.setTimeout(limitHeight,0)        
        }
        function limitHeight(){
            let topOfFCList = self.element.offset().top;
            let bottomOfVisibleWindow = $(window).height();
            let maxheight = bottomOfVisibleWindow - topOfFCList - (self.element.outerHeight()-self.element.height())-5;
            self.element.css({maxHeight:maxheight})
        }

    }

}
function makeMainDialogElement(){
    let html = `
        <div class="annotation-ui-mainwindow" title="Annotations">
            <div class='annotation-ui-style-tools'></div>
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
    return $(html);
}