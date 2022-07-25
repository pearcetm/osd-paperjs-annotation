import {StyleUI} from './styleui.js';
import { FeatureCollection } from './featurecollection.js';
import {FileDialog} from './filedialog.js';

export class MainDialog{

    constructor(opts={AnnotationPaper:null,filename:'',positioningElement:null,appendTo:'body'}){
        let _this=this;
        if(!opts.AnnotationPaper){
            error('Instance of AnnotationPaper must be passed to the constructor in the options')
        }
        let positioningElement=opts.positioningElement? $(opts.positioningElement) : $('body');

        let Paper = opts.AnnotationPaper;
        let styleui = new StyleUI(Paper);
        let fileDialog = new FileDialog(this);
        
        _this.element = makeMainDialogElement();
        _this.element.find('.annotation-ui-style-tools').empty().append(styleui.element);

        _this.filename = opts.filename || 'Unnamed File';
        _this.element.attr('title',_this.filename);

        _this.refresh=refreshDialogPosition;
        
        _this.close = function(){_this.element.dialog('close');}
        _this.open = function(){_this.element.dialog('open');}
        _this.toggle=function(){_this.element.dialog('isOpen') ? _this.element.dialog('close') : _this.element.dialog('open');}
        _this.deactivate = function(){_this.element.addClass('deactivated')}
        _this.activate = function(){_this.element.removeClass('deactivated')}
        
        _this.destroy = function(){
            _this.element.dialog('destroy');
            _this.element.remove();
        }
        _this.addFeatureCollection = function(geoJSON){
            let baseStyle = Object.assign({}, styleui.getBaseStyle(), (geoJSON && geoJSON.properties)? geoJSON.properties : {})
            let fc=new FeatureCollection({geoJSON:geoJSON, AnnotationPaper:Paper, baseStyle:baseStyle});
            _this.element.find('.annotation-ui-feature-collections').append(fc.element).sortable('refresh');
            fc.element.trigger('element-added');
            setTimeout(function(){fc.element.addClass('inserted'); }, 30);//this allows opacity fade-in to be triggered
            return fc;
        }
        
        _this.getFeatureCollections = function(includeTrashed=false){
            let selector = includeTrashed ? '.annotation-ui-feature-collections .feature-collection' :
                                            '.annotation-ui-feature-collections .feature-collection:not(.trashed)';

            return _this.element.find(selector).toArray().map(function(e){
                return $(e).data('featureCollection');
            })
        }
        _this.toGeoJSON = function(opts={asString:true,includeTrashed:false}){ 
            let collections = _this.getFeatureCollections(opts.includeTrashed).map(function(fc){
                return fc.toGeoJSON();
            });
            return opts.asString ? JSON.stringify(collections) : collections;
        };
        _this.loadGeoJSON = function(geoJSON,opts={replace:false}){
            if(opts.replace){
                _this.getFeatureCollections(true).forEach(fc=>fc.remove())
            }
            geoJSON.forEach(function(fc){
                let f = _this.addFeatureCollection(fc);
                f.ui.setOpacity(styleui._totalOpacity);
                f.ui.setFillOpacity(styleui._fillOpacity);
            })
        }
        
        //add UI handlers
        _this.element.find('.show-all-annotations').on('click',function(){
            Paper.setGlobalVisibility(true);
            _this.element.removeClass('disabled');
        });
        _this.element.find('.hide-all-annotations').on('click',function(){
            Paper.setGlobalVisibility(false);
            _this.element.addClass('disabled');
        });
        _this.element.find('.new-feature-collection').on('click',function(ev){
            ev.stopPropagation();
            ev.preventDefault();
            _this.addFeatureCollection();
        });
        _this.element.find('.toggle-annotations').on('click',function(ev){
            let hidden = _this.element.find('.annotation-ui-feature-collections .feature-collection.annotation-hidden');
            if(hidden.length > 0) hidden.find('.visibility-toggle').trigger('click');
            else _this.element.find('.annotation-ui-feature-collections .feature-collection:not(.hidden) .visibility-toggle').trigger('click');
        });


        //setup sortable featurecollection interface
        _this.element.find('.annotation-ui-feature-collections').sortable({contain:'parent',update:function(){
            _this.element.find('.annotation-ui-feature-collections .feature-collection').each(function(idx,g){
                let fg = $(g).data('featureCollection');
                fg.paperGroup.layer.bringToFront();
            })
        }})

        //setup jqueryUI dialog object
        _this.element.dialog({
            open:onOpen,
            close:onClose,
            resize:limitHeight,
            autoOpen:false,
            height:'auto',
            appendTo:opts.appendTo,
        });
        _this.element.closest('.ui-dialog').draggable('option','containment','window')
        let fb=$('<button>',{class:'file-button'}).text('File').prependTo(_this.element.dialog('instance').classesElementLookup['ui-dialog-title'])
        .on('click',function(){
            fileDialog.dialog('open');
            _this.saveHandler && _this.saveHandler();       
        });
        fb.button({
            showLabel:true,
        })

        _this.element.on('element-added',function(ev){
            let el = $(ev.target);
            _this.refresh(el);
        })
        
        //set up delegated events

        _this.element.on('selected','.feature',function(ev){
            ev.stopPropagation();
            let feature = $(this).addClass('selected').data('feature');
            styleui.addActiveFeature(feature);           
        });
        _this.element.on('deselected','.feature',function(ev){
            ev.stopPropagation();
            let feature = $(this).removeClass('selected').data('feature');
            styleui.removeActiveFeature(feature);
        });
        _this.element.on('selected','.feature-collection',function(ev){
            let fc = $(this).data('featureCollection');
            styleui.addActiveCollection(fc);
            setOpacity(styleui._totalOpacity);
        });
        
        _this.element.on('deselected','.feature-collection',function(ev){
            let fc = $(this).data('featureCollection');
            styleui.removeActiveCollection(fc);
            setOpacity(styleui._totalOpacity);
        });

        
        _this.element.on('click','.toggle-list',function(ev){
            $(this).closest('.features').toggleClass('collapsed');
            ev.stopPropagation();
        });
        
        _this.element.on('value-changed',function(){
            let el = $(this);
            console.log('value-changed',el);
            _this.element.find('.feature.selected').trigger('selected');
            _this.element.find('.feature-collection.active').trigger('selected');
        });

        _this.element.find('input.annotation-total-opacity').on('input',function(){
            let opacity = this.value;
            styleui._totalOpacity=opacity;
            setOpacity(opacity);
        }).trigger('input');

        _this.element.find('input.annotation-fill-opacity').on('input',function(){
            let opacity = this.value;
            styleui.setFillOpacity(opacity);
            //apply opacity directly to all elements here
            _this.element.find('.feature-collection').each(function(_,el){
                let fc=$(el).data('featureCollection');
                fc&&fc.ui.setFillOpacity(opacity);
            })
        }).trigger('input');

        function setOpacity(o){
            let status = _this.element.find('.feature-collection').toArray().reduce(function(ac,el){
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
            let pos = _this.element.dialog('option','position');
            positionDialog(pos);
            scrolltoelement && setTimeout(()=>{
                scrolltoelement[0].scrollIntoView(false)
            }, 0);
        }
        function onOpen(){positionDialog();Paper.showToolbar();}
        function onClose(){Paper.hideToolbar();}
        function positionDialog(pos){
            let defaultPos={my:'right top', at:'right top', of:positioningElement}
            if(positioningElement.hasClass('navigator')){
                defaultPos={my:'right top', at:'right bottom', of:positioningElement}
            }
            
            pos = pos || defaultPos;

            _this.element.dialog('option','position',pos);
            window.setTimeout(limitHeight,0)        
        }
        function limitHeight(){
            let topOfFCList = _this.element.offset().top;
            let bottomOfVisibleWindow = $(window).height();
            let maxheight = bottomOfVisibleWindow - topOfFCList - (_this.element.outerHeight()-_this.element.height())-5;
            _this.element.css({maxHeight:maxheight})
        }

    }

}
function makeMainDialogElement(){
    let html = `
        <div class="annotation-ui-mainwindow" title="Annotations">
            <div class='annotation-ui-style-tools'></div>
            <div class='annotation-ui-toolbar annotation-visibility-controls'>                
                <div class="visibility-buttons btn-group btn-group-sm disable-when-deactivated" role="group">
                    <button class="btn btn-default show-all-annotations" type="button" title="Show all annotations">
                        <span class="glyphicon glyphicon-eye-open fa fa-eye"></span>
                    </button><button class="btn btn-default hide-all-annotations" type="button" title="Hide all annotations">
                        <span class="glyphicon glyphicon-eye-close fa fa-eye-slash"></span>
                    </button><button class="btn btn-default toggle-annotations" type="button" title="Toggle annotations">
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