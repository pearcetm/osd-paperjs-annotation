/**
 * OpenSeadragon paperjs overlay plugin based on paper.js
 * @version 0.4.13
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

//styles in annotationui.css

import { addCSS } from './utils/addcss.mjs';
import { AnnotationLayout } from './annotationlayout.mjs';
import { FileDialog } from './filedialog.mjs';

addCSS('annotationui.css', 'annotationui');
addCSS('editablecontent.css', 'editablecontent');

/**
 * @memberof OSDPaperjsAnnotation
 * @class
 * A class for creating and managing the annotation UI. Intended to be constructed only via AnnotationToolkit.addAnnotationUI().
 * Toolbar and layer UI are owned by the toolkit; this class uses them via getToolbar()/getLayerUI() and places them via AnnotationLayout.
 */
class AnnotationUI {

  /**
   * Creates an instance of AnnotationUI.
   *
   * @param {Object} annotationToolkit - The annotation toolkit object.
   * @param {AnnotationToolset} toolset - The toolset (owned by the toolkit).
   * @param {Object} opts - The options for the AnnotationUI.
   * @param {boolean} [opts.autoOpen=true] - Determines if the AnnotationUI should be automatically opened.
   * @param {Array} [opts.featureCollections=[]] - An array of feature collections to load.
   * @param {boolean} [opts.addButton=true] - Determines if the AnnotationUI button should be added.
   * @param {boolean} [opts.addToolbar=true] - Whether toolbar is requested (toolkit already created it via getToolbar if true).
   * @param {string[]} [opts.tools=null] - An array of tool names to use in the AnnotationToolbar.
   * @param {boolean} [opts.addLayerUI=true] - Whether layer UI is requested (toolkit already created it via getLayerUI if true).
   * @param {boolean} [opts.addFileButton=true] - Determines if the file button should be added for saving/loading annotations.
   * @param {boolean} [opts.buttonTogglesToolbar=true] - Determines if the AnnotationToolbar visibility is toggled by the AnnotationUI button.
   * @param {boolean} [opts.buttonTogglesLayerUI=true] - Determines if the LayerUI visibility is toggled by the AnnotationUI button.
   */
  constructor(annotationToolkit, toolset, opts) {
    let defaultOpts = {
      autoOpen: true,
      featureCollections: [],
      addButton: true,
      addToolbar: true,
      tools: null,
      addLayerUI: true,
      addFileButton: true,
      buttonTogglesToolbar: true,
      buttonTogglesLayerUI: true,
    };

    opts = this.options = Object.assign(defaultOpts, opts);
    this._annotationToolkit = annotationToolkit;
    this._viewer = annotationToolkit.viewer;

    const toolbar = annotationToolkit.getToolbar?.() ?? null;
    const layerUI = annotationToolkit.getLayerUI?.() ?? null;
    const toolbarRef = toolbar ? { element: toolbar.element, show: () => toolbar.show(), hide: () => toolbar.hide() } : null;
    const layerUIRef = layerUI ? { element: layerUI.element, show: () => layerUI.show(), hide: () => layerUI.hide() } : null;

    this._layout = new AnnotationLayout(this._viewer, {
      toolbar: toolbarRef,
      layerUI: layerUIRef,
      addButton: opts.addButton !== false,
      addViewerButton: (config) => annotationToolkit.overlay.addViewerButton(config),
      buttonTogglesToolbar: opts.buttonTogglesToolbar !== false,
      buttonTogglesLayerUI: opts.buttonTogglesLayerUI !== false,
      initialOpen: opts.autoOpen !== false,
    });

    if (opts.autoOpen !== false) {
      toolbar?.show();
      layerUI?.show();
    } else {
      toolbar?.hide();
      layerUI?.hide();
    }

    this._fileDialog = new FileDialog(annotationToolkit, { appendTo: this._viewer.element });
    this._filebutton = null;
    if (opts.addFileButton) {
      this._filebutton = annotationToolkit.overlay.addViewerButton({
        onClick: () => this._fileDialog.toggle(),
        faIconClass: 'fa-save',
        tooltip: 'Save/Load Annotations',
      });
    }

    if (opts.featureCollections) {
      annotationToolkit.loadGeoJSON(opts.featureCollections);
    }
  }

  /**
   * Destroys the AnnotationUI and cleans up its resources. Does not destroy the toolkit's toolbar or layer UI.
   */
  destroy() {
    this._layout?.destroy();
    this._layout = null;
    if (this._filebutton) {
      const idx = this._viewer.buttonGroup.buttons.indexOf(this._filebutton);
      if (idx > -1) this._viewer.buttonGroup.buttons.splice(idx, 1);
      this._filebutton.element.remove();
      this._filebutton = null;
    }
  }

  /**
   * Show the LayerUI interface
   */
  showUI() {
    this.ui?.show();
  }

  /**
   * Hide the LayerUI interface
   */
  hideUI() {
    this.ui?.hide();
  }

  /**
   * Show the toolbar
   */
  showToolbar() {
    this.toolbar?.show();
  }

  /**
   * Hide the toolbar
   */
  hideToolbar() {
    this.toolbar?.hide();
  }

  get ui() {
    return this._annotationToolkit.getLayerUI?.() ?? null;
  }

  get toolbar() {
    return this._annotationToolkit.getToolbar?.() ?? null;
  }

  get element() {
    return this.ui?.element ?? null;
  }

}

export { AnnotationUI };
