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

//requires jquery, jqueryui
//styles in annotationui.css

import { addCSS } from './addcss.mjs';
import { AnnotationToolbar } from './annotationtoolbar.mjs';
import { LayerUI } from './layerui.mjs';
import { FileDialog } from './filedialog.mjs';

addCSS('https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.12.1/jquery-ui.min.css', 'jquery-ui');
addCSS('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.1.1/css/all.min.css', 'font-awesome/6.1.1/css/all');
addCSS('annotationui.css', 'annotationui');
addCSS('osd-button.css', 'osd-button');
addCSS('editablecontent.css', 'editablecontent');

/**
 * @memberof OSDPaperjsAnnotation
 * @class
 * A class for creating and managing the annotation UI
 */
class AnnotationUI {

  /**
   * Creates an instance of AnnotationUI.
   *
   * @param {Object} annotationToolkit - The annotation toolkit object.
   * @param {Object} opts - The options for the AnnotationUI.
   * @param {boolean} [opts.autoOpen=true] - Determines if the AnnotationUI should be automatically opened.
   * @param {Array} [opts.featureCollections=[]] - An array of feature collections to load.
   * @param {boolean} [opts.addButton=true] - Determines if the AnnotationUI button should be added.
   * @param {boolean} [opts.addToolbar=true] - Determines if the AnnotationToolbar should be added.
   * @param {string[]} [opts.tools=null] - An array of tool names to use in the AnnotationToolbar. If not provided, all available tools will be used.
   * @param {boolean} [opts.addLayerDialog=true] - Determines if the LayerUI dialog should be added.
   * @param {boolean} [opts.addFileButton=true] - Determines if the file button should be added for saving/loading annotations.
   * @param {boolean} [opts.buttonTogglesToolbar=true] - Determines if the AnnotationToolbar visibility is toggled by the AnnotationUI button.
   * @param {boolean} [opts.buttonTogglesLayerUI=true] - Determines if the LayerUI visibility is toggled by the AnnotationUI button.
   */
  constructor(annotationToolkit, opts) {
    let defaultOpts = {
      autoOpen: true,
      featureCollections: [],
      addButton: true,
      addToolbar: true,
      tools: null,
      addLayerDialog: true,
      addFileButton: true,
      buttonTogglesToolbar: true,
      buttonTogglesLayerUI: true,
    };

    opts = this.options = Object.assign(defaultOpts, opts);
    let _viewer = this._viewer = annotationToolkit.viewer; // shorter alias
    this._isOpen = !!opts.autoOpen;

  
    /**
     * _toolbar: AnnotationToolbar UI for interactive tools
     * @private
     */
    this._toolbar = new AnnotationToolbar(annotationToolkit.overlay.paperScope, opts.tools);
    if (opts.addToolbar) {
      this._toolbar.addToOpenSeadragon(_viewer);
    }


    /**
     * _fileDialog: FileDialog UI for loading/saving data
     * @private
     */
    this._fileDialog = new FileDialog(annotationToolkit, { appendTo: _viewer.element });
    this._filebutton = null;
    if (opts.addFileButton) {
      //Handles the click event of the file button.
      this._filebutton = annotationToolkit.overlay.addViewerButton({
        onClick: () => {
          this._fileDialog.toggle();
        },
        faIconClasses: 'fa-solid fa-save',
        tooltip: 'Save/Load Annotations',
      });
    }


    let dialogOpts = {
      filename: _viewer.world.getItemAt(0) && this._viewer.world.getItemAt(0).source.name, //todo make this work with multiple tiledImages
      positioningElement: (this, _viewer.navigator || this._viewer).element,
      appendTo: this._viewer.element,
      toolbar: this._toolbar,
    };

    /**
     * _layerUI: LayerUI: graphical user interface for this annotation layer
     * @private
     */
    this._layerUI = new LayerUI(annotationToolkit, dialogOpts);
    if (opts.addLayerDialog) {
      this._createJqueryUIdialog();
    }

    if(opts.autoOpen){
      this._layerUI.show();
      this._toolbar.show();
    } else {
      this._layerUI.hide();
      this._toolbar.hide();
    }


    /**
     * _button: Button for toggling LayerUI and/or AnnotationToolbar
     * @private
     */
    this._button = null;
    if (opts.addButton) {
      this._button = annotationToolkit.overlay.addViewerButton({
        onClick: () => {
          this._isOpen = !this._isOpen;
          if (this._isOpen) {
            this.options.buttonTogglesToolbar && this._toolbar.show();
            this.options.buttonTogglesLayerUI && this._layerUI.show();
          } else {
            this.options.buttonTogglesToolbar && this._toolbar.hide();
            this.options.buttonTogglesLayerUI && this._layerUI.hide();
          }
        },
        faIconClasses: 'fa-solid fa-pencil',
        tooltip: 'Annotation Interface',
      });
    }

    if (opts.featureCollections) {
      annotationToolkit.loadGeoJSON(opts.featureCollections);
    }
  }

  /**
   * Destroys the AnnotationUI and cleans up its resources.
   */
  destroy() {
    this._layerUI.destroy();
    this._toolbar.destroy();
    if (this._button) {
      let idx = this._viewer.buttonGroup.buttons.indexOf(this._button);
      if (idx > -1) {
        this._viewer.buttonGroup.buttons.splice(idx, 1);
      }
      this._button.element.remove();
    }
    if (this._filebutton) {
      let idx = this._viewer.buttonGroup.buttons.indexOf(this._filebutton);
      if (idx > -1) {
        this._viewer.buttonGroup.buttons.splice(idx, 1);
      }
      this._filebutton.element.remove();
    }
  }

  /**
   * Show the LayerUI interface
   */
  showUI(){
    this.ui.show();
  }

  /**
   * Hide the LayerUI interface
   */
  hideUI(){
    this.ui.hide();
  }

  /**
   * Show the toolbar
   */
  showToolbar(){
    this.toolbar.show();
  }

  /**
   * Hide the toolbar
   */
  hideToolbar(){
    this.toolbar.hide();
  }

  get ui(){
    return this._layerUI;
  }

  get toolbar() {
    return this._toolbar;
  }

  get element(){
    return this._layerUI.element;
  }

  /**
   * Creates a jQuery UI dialog for the LayerUI.
   * @private
   */
  _createJqueryUIdialog() {
    let element = this._layerUI.element;

    let positioningElement = $((this._viewer.navigator || this._viewer).element);

    element.on('element-added', function (ev) {
      let el = $(ev.target);
      refreshDialogPosition(el);
    });
    element.dialog({
      open: onOpen,
      resize: limitHeight,
      autoOpen: false,
      closeOnEscape: false,
      height: 'auto',
      appendTo: this._viewer.element,
    });
    element.closest('.ui-dialog').draggable('option', 'containment', 'parent');

    this._layerUI.addHandler('show', () => {
      element.dialog('open');
    });
    this._layerUI.addHandler('hide', () => {
      element.dialog('close');
    });
    this._layerUI.addHandler('destroy', () => {
      element.dialog('destroy');
    });

    //reset viewer's mouse tracker to parent container of viewer instead of inner container, so tracker captures UI dialogs as well
    //to do: reset this on removal of the annotationUI?
    this._viewer.outerTracker.setTracking(false);
    this._viewer.outerTracker.element = this._viewer.element;
    this._viewer.outerTracker.setTracking(true);

    let fb = $('<button>', { class: 'file-button' })
      .text('File')
      .prependTo(element.dialog('instance').classesElementLookup['ui-dialog-title'])
      .on('click', () => {
        this._fileDialog.dialog('open');
      });
    fb.button({
      showLabel: true,
    });

    function onOpen() {
      positionDialog();
    }

    function positionDialog(pos) {
      let defaultPos = { my: 'right top', at: 'right top', of: positioningElement };
      if (positioningElement.hasClass('navigator')) {
        defaultPos = { my: 'right top', at: 'right bottom', of: positioningElement };
      }

      pos = pos || defaultPos;

      element.dialog('option', 'position', pos);
      window.setTimeout(limitHeight, 0);
    }

    function limitHeight() {
      let topOfFCList = element.offset().top - $(window).scrollTop();
      let bottomOfVisibleWindow = $(window).height();
      let maxheight = bottomOfVisibleWindow - topOfFCList - (element.outerHeight() - element.height()) - 5;
      element.css({ maxHeight: maxheight });
    }

    function refreshDialogPosition(scrolltoelement) {
      let pos = element.dialog('option', 'position');
      positionDialog(pos);
      scrolltoelement &&
        setTimeout(() => {
          //scrolltoelement[0].scrollIntoView(false)
          scrolltoelement[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }, 0);
    }
  }
}

export { AnnotationUI };
