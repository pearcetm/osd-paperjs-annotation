
import { AnnotationToolkit } from '../../src/js/annotationtoolkit.mjs';
import { DSAUserInterface } from '../dsa/dsauserinterface.mjs';
import { RotationControlOverlay } from '../../src/js/rotationcontrol.mjs';


$(window).on('beforeunload',function(){
    return 'Are you sure you want to leave?';
})

let v1 = createViewer();
let tk;
let toolbar;

let items = [];
let reviewIndex = -1;
let groups = {};


v1.addOnceHandler('open',()=>{
    v1.viewport.zoomTo(0.01,null,true);
    v1.viewport.zoomTo(0.5);
})
v1.open(
    {
        type: 'image',
        url:  '../dsa/dsa_logo.svg',
        buildPyramid: false
    }
)

// DSA setup

let dsaUI = new DSAUserInterface(v1);
dsaUI.header.appendTo('.dsa-ui-container');
dsaUI.annotationEditorGUI.appendTo('#dsa-gui');

//dsaUI event handlers
dsaUI.addHandler('annotation-opened',event=>{
    $('#reviewer-controls').show();
    setupReview();
});
dsaUI.addHandler('annotation-closed',()=>{
    $('#reviewer-controls').hide();
});


//reviewer control setup
$('#reviewer-controls .review-next').on('click',reviewNext);
$('#reviewer-controls .review-previous').on('click',reviewPrevious);
$('#reviewer-controls .refresh-review').on('click',setupReview);
$('#reviewer-controls .align-to-roi').on('click',alignToROI);
$('#reviewer-controls select').on('change',event=>addSelectedItemsToLayer(groups[event.target.value]));

setupKeypressHandlers();
setupMagnificationControls();

function reviewNext(){
    let newIndex = OpenSeadragon.positiveModulo(reviewIndex+1, items.length);
    let item = items[newIndex];
    if(!item) return;
    item.select(false);
    
}
function reviewPrevious(){
    let newIndex = OpenSeadragon.positiveModulo(reviewIndex-1, items.length);
    let item = items[newIndex];
    if(!item) return;
    item.select(false);
    
}
function handleItemSelected(){
    let selected = getSelectedFeatures();
    if(selected.length){
        let item = selected[0];
        if(item.displayName == 'Creating...'){
            // item.displayName = item.layer.displayName;
            let changeLabel = (event)=>{
                window.setTimeout(()=>{
                    event.item.displayName = event.item.layer.displayName;
                    setupReview();
                });
            };
            item.on('item-replaced',changeLabel);
            // toolbar.tools.rectangle.activate();
            return;
        }
        setupReviewForItem(item);
        if(selected.length === 1){
            //Only one item - navigate to it.
            item.FeatureUI.centerItem(true);
        }
    } else {
        $('#reviewer-controls .current-index').text('-'); // add one for readability
        let dropdown = $('#reviewer-controls select')[0];
        dropdown.selectedIndex = -1;
    }
}
function setupReviewForItem(item){
    let index = getIndexOfSelection([item]);
    reviewIndex = index;
    $('#reviewer-controls .current-index').text(reviewIndex + 1); // add one for readability
    let dropdown = $('#reviewer-controls select')[0];
    dropdown.value = item.layer.displayName;
}
function removeItem(item){
    let index = items.indexOf(item);
    if(index > -1){
        items.splice(index, 1);
        $('#reviewer-controls .total-annotations').text(items.length);
        if(reviewIndex >= index){
            reviewIndex -= 1; //shift index of current item to match new position
            $('#reviewer-controls .current-index').text(reviewIndex + 1); // add one for readability
        }
    }
}
function addSelectedItemsToLayer(layer){

    // get selected items
    let list = getSelectedFeatures();
    list.forEach(item=>{
        layer.addChild(item);
        // item.style.set(layer.defaultStyle);
        item.style = layer.defaultStyle;
        item.applyRescale();
        item.displayName = layer.displayName;
    });
}

function setupReview(){
    // identify which FeatureCollections and Features to work with
    let layers = tk.getFeatureCollectionGroups();
    items = getFeaturesToReview();
    // add groups (other than those that start or end with "ROI" (case insensitive)) to the select dropdown and the dictionary of groups
    groups = {};
    let select = $('#reviewer-controls select').empty();
    layers.forEach(g=>{
        if( !(''+g.displayName).match(/^ROI|ROI$/i) ){
            $('<option>').text(g.displayName).appendTo(select);
            groups[g.displayName] = g;

            // Set the FeatureCollection/Layer default style to be the style of the first child
            let firstChild = g.children[0];
            if(firstChild){
                g.defaultStyle.set(firstChild.style);
            }
        }
    })
    $('#reviewer-controls .total-annotations').text(items.length);
 
}

function getFeaturesToReview(){
    let items = tk.getFeatures().filter(f=>!(''+f.layer.displayName).match(/^ROI|ROI$/i) );
    return items;
}
function getSelectedFeatures(){
    let realSelection = getFeaturesToReview().filter(item=>item.selected);
    if(realSelection.length){
        tk.getFeatures().filter(f=>!(''+f.layer.displayName.match(/^ROI|ROI$/i) )).forEach(item=>{
            item.deselect(true);
        });
    }
    
    return realSelection;
}
function getIndexOfSelection(selection){
    if(!selection){
        selection = getSelectedFeatures();
    } 
    let index = -1;
    if(selection.length){
        let first = selection[0];
        index = items.indexOf(first);
    }
    return index;
}

function alignToROI(){
    // console.log('alignToROI',event);
    let ROI_layer = tk.overlay.paperScope.project.layers.filter(l=>l.displayName && l.displayName.match(/^ROI|ROI$/i) )[0];
    let ROI = ROI_layer && ROI_layer.children[0];
    if(ROI){
        try{
            let path = ROI.children[0];
            let angle = path.segments[1].point.subtract(path.segments[0].point).angle;
            //let angle = ROI.features[0].geometry.properties.angle;
            viewer.viewport.rotateTo(-angle, null, true);
        } catch (e){
            console.warn('ROI was found, did not have the expected format.');
        }
        
    } else {
        alert('No FeatureCollection (group) with a name starting with ROI was found');
    }
}

function setupMagnificationControls(){
    $('.magnification-widget')
        .on('mouseover',ev=>$(ev.currentTarget).addClass('expanded'))
        .on('mouseout',ev=>$(ev.currentTarget).removeClass('expanded'));

    $('.magnification-widget input[type=range]').on('input',function(){
        let mag = sliderValueToMag(this.value);
        let sf = getZoomScaleFactor(v1, getFullResolutionMagnification(v1));
        let zoom = magToZoom(mag, sf);
        v1.viewport.zoomTo(zoom, null, true);
    });
    $('.magnification-widget button').on('click',function(){
        let mag = $(this).data('value');
        let sf = getZoomScaleFactor(v1, getFullResolutionMagnification(v1));
        let zoom = magToZoom(mag, sf);
        v1.viewport.zoomTo(zoom, null, true);
    });

    v1.addHandler('zoom',event=>{
        let sf = getZoomScaleFactor(v1, getFullResolutionMagnification(v1));
        setMagnificationValue(zoomToMag(event.zoom, sf));
    })

    let smin = 1;
    let smax = 100;
    let mmin = 0.5;
    let mmax = 80;
    let scale = (Math.log2(mmax) - Math.log2(mmin)) / (smax - smin);
    function sliderValueToMag(value){
        return Math.pow(2, scale*(value - smin) + Math.log2(mmin));
    }
    function magToSliderValue(mag){
        return smin + (1/scale) * (Math.log2(mag) - Math.log2(mmin));
    }
    function zoomToMag(zoom, scaleFactor){
        return zoom * scaleFactor;
    }
    function magToZoom(mag, scaleFactor){
        return mag / scaleFactor;
    }
    function getFullResolutionMagnification(viewer){
        let src = viewer.world.getItemAt(0).source;
        let item = src.item;
        if(!item){
            return;
        }
        return item.detail.magnification;
    }

    function getZoomScaleFactor(viewer, fullResMagnification){
        return fullResMagnification * viewer.viewport.maxZoomPixelRatio / viewer.viewport.getMaxZoom();
    }

    function setMagnificationValue(mag){
        
        // console.log('mag',mag);
        $('.current-mag').text(mag.toFixed(2));
        $('.magnification-widget input[type=range]').val(magToSliderValue(mag));
    }


}

function setupKeypressHandlers(){
    // add key handlers
    $(window).on('keypress',event=>{
        if(event.originalEvent.repeat || ['INPUT','TEXTAREA'].includes(event.target.tagName) ){
            return;
        }
        let key = event.key;
        // let preventDefault = true;
        if(key=='q'){
            //navigate to previous
            reviewPrevious();
        } else if (key == 'w'){
            //cycle through classification groups
            let dropdown = $('#reviewer-controls select')[0];
            dropdown.selectedIndex = (dropdown.selectedIndex+1) % dropdown.options.length;
            $(dropdown).trigger('change');
        } else if(key == 'e'){
            //navigate to next
            reviewNext();
        } else if(key == 'n'){
            //create new element
            console.log('n clicked');
            let project = tk.overlay.paperScope.project;
            let layer = project.layers.filter(layer=>layer.isGeoJSONFeatureCollection && !layer.displayName.match(/^ROI|ROI$/i))[0];
            if(layer){
                let newFeature = layer.featureCollectionUI.createFeature();
                newFeature.select();
            }
        } else if(key == 'r'){
            if(toolbar.tools.rectangle.isActive()){
                toolbar.tools.rectangle.deactivate();
            } else {
                toolbar.tools.rectangle.activate();
            }
        } else if(key == 'p'){
            if(toolbar.tools.point.isActive()){
                toolbar.tools.point.deactivate();
            } else {
                toolbar.tools.point.activate();
            }
        } else {
            // preventDefault = false;
        }
        
    });

    // suppress default OSD keydown handling for a subset of keys
    v1.addHandler('canvas-key',event=>{
        if(['q','w','e','r','a','s','d','f'].includes(event.originalEvent.key)){
            event.preventDefaultAction = true;
        }
    });
}


// Viewer creation and annotation setup

function createViewer(){
    let viewer = window.viewer = OpenSeadragon({
        element:'viewer',
        prefixUrl: "https://openseadragon.github.io/openseadragon/images/",
        minZoomImageRatio:0.01,
        maxZoomPixelRatio:16,
        visibilityRatio:0,
        crossOriginPolicy: 'Anonymous',
        ajaxWithCredentials: false,
        sequenceMode:true,
        showNavigator:true,
    });

    new RotationControlOverlay(viewer);
    
    viewer.addHandler('page',ev=>{
        
        let ts=ev.eventSource.tileSources[ev.page];
        
        // tk defined at containing scope
        tk = new AnnotationToolkit(v1);

        // add project to window for debugging
        window.project = tk.overlay.paperScope.project;
        tk.overlay.paperScope.project.on('item-selected', debounce(handleItemSelected));
        tk.overlay.paperScope.project.on('item-removed', event=>removeItem(event.item));

        let ui=tk.addAnnotationUI({
            autoOpen:true,
            addLayerDialog:false,
            tools:['default','select','point','rectangle','style']
        });
        ui._layerUI.element.appendTo($('#paper-gui')).on('element-added',(ev)=>{
            let scrollToElement = $(ev.target);
            scrollToElement && setTimeout(()=>{
                scrollToElement[0].scrollIntoView({block: "nearest", inline: "nearest"})
            }, 0);
        });
        ui._layerUI.element.find('input.annotation-fill-opacity').val('0.5').trigger('input');
        
        toolbar = ui.toolbar;

        $('#current-file').text(`${ts.name} (${ev.page+1} of ${ev.eventSource.tileSources.length})`);

    });


    return viewer;
}

function debounce(func, timeout = 0){
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}