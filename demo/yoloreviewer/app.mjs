
import { AnnotationToolkit } from '../../js/annotationtoolkit.mjs';
import { DSAUserInterface } from '../dsa/dsauserinterface.mjs';
import { RotationControlOverlay } from '../../js/rotationcontrol.mjs';


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

// get initial DSA link from location hash
dsaUI.dsaLinkInput.val(window.location.hash.substring(1));
dsaUI.header.appendTo('.dsa-ui-container');
dsaUI.annotationEditorGUI.appendTo('#dsa-gui');

//dsaUI event handlers
dsaUI.addHandler('annotation-opened',()=>{
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
$('#reviewer-controls select').on('change',addSelectedItemsToGroup);

function reviewNext(){
    let newIndex = OpenSeadragon.positiveModulo(reviewIndex+1, items.length);
    let item = items[newIndex];
    item.select(false);
}
function reviewPrevious(){
    let newIndex = OpenSeadragon.positiveModulo(reviewIndex-1, items.length);
    let item = items[newIndex];
    item.select(false);
}
function handleItemSelected(){
    let selected = getSelectedFeatures();
    if(selected.length){
        let item = selected[0];
        setupReviewForItem(item);
        if(selected.length === 1){
            //Only one item - navigate to it.
            item.FeatureUI.centerItem();
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
function addSelectedItemsToGroup(event){
    let layer = groups[event.target.value];

    // get selected items
    let list = getSelectedFeatures();
    list.forEach(item=>{
        layer.addChild(item);
        item.style.set(layer.defaultStyle);
        item.applyRescale();
    });
}

function setupReview(){
    // identify which FeatureCollections and Features to work with
    let layers = tk.getFeatureCollectionLayers();
    items = getFeaturesToReview();
    // add groups (other than "ROI") to the select dropdown and the dictionary of groups
    groups = {};
    let select = $('#reviewer-controls select').empty();
    layers.forEach(g=>{
        if(''+g.displayName !== 'ROI'){
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
    let items = tk.getFeatures().filter(f=>''+f.layer.displayName !== 'ROI');
    return items;
}
function getSelectedFeatures(){
    let realSelection = getFeaturesToReview().filter(item=>item.selected);
    if(realSelection.length){
        tk.getFeatures().filter(f=>''+f.layer.displayName == 'ROI').forEach(item=>{
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

// add key handlers
$(window).on('keypress',event=>{
    if(event.originalEvent.repeat){
        return;
    }
    let key = event.key;
    let preventDefault = true;
    if(key=='c'){
        //navigate to previous
        reviewPrevious();
    } else if (key == 'v'){
        //cycle through classification groups
        let dropdown = $('#reviewer-controls select')[0];
        dropdown.selectedIndex = (dropdown.selectedIndex+1) % dropdown.options.length;
        $(dropdown).trigger('change');
    } else if(key == 'b'){
        //navigate to next
        reviewNext();
    } else if(key == 'f'){
        if(toolbar.tools.select.isActive()){
            toolbar.tools.select.deactivate();
        } else {
            toolbar.tools.select.activate();
        }
    } else if(key == 'g'){
        if(toolbar.tools.rectangle.isActive()){
            toolbar.tools.rectangle.deactivate();
        } else {
            toolbar.tools.rectangle.activate();
        }
    } else {
        preventDefault = false;
    }
    if(preventDefault){
        event.preventDefault();
        event.stopImmediatePropagation();
    }
})

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
        //console.log('page',ev);
        let ts=ev.eventSource.tileSources[ev.page];
        if(!ts.ready && ts.file && ts.file.constructor === File){
            let fr = new FileReader();
            fr.readAsDataURL(v1.tileSources[ev.page].file);
            fr.onload = () => ts.getImageInfo(fr.result);
        }
        
        // tk defined at containing scope
        tk = new AnnotationToolkit(v1);

        // add project to window for debugging
        window.project = tk.overlay.paperScope.project;
        tk.overlay.paperScope.project.on('item-selected', debounce(handleItemSelected));

        tk.addOnceHandler('before-destroy',(ev)=>{
            ts.annotationStore = tk.toGeoJSON();
        })
        let ui=tk.addAnnotationUI({
            autoOpen:true,
            addLayerDialog:false,
            tools:['default','select','rectangle','style']
        });
        ui._layerUI.element.appendTo($('#paper-gui')).on('element-added',(ev)=>{
            let scrollToElement = $(ev.target);
            scrollToElement && setTimeout(()=>{
                scrollToElement[0].scrollIntoView({block: "nearest", inline: "nearest"})
            }, 0);
        });
        ui._layerUI.element.find('input.annotation-fill-opacity').val('0.5').trigger('input');
        
        toolbar = ui.toolbar;

        $('#current-file').text(`${ts.name} (${ev.page+1} of ${ev.eventSource.tileSources.length})`)

    })
    return viewer;
}

function debounce(func, timeout = 0){
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}