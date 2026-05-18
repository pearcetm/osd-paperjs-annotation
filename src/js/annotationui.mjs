/**
 * OpenSeadragon paperjs overlay plugin based on paper.js
 * @version 0.7.5
 *
 * Includes additional open source libraries which are subject to copyright notices
 * as indicated accompanying those segments of code.
 *
 * Original code:
 * Copyright (c) 2022-2026, Thomas Pearce
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

/**
 * @memberof OSDPaperjsAnnotation
 * @class
 * Deprecated wrapper around split toolkit APIs. Constructed only via AnnotationToolkit.addAnnotationUI().
 * Layout, viewer buttons, and FileDialog are owned by the toolkit.
 */
class AnnotationUI {

  /**
   * @param {Object} annotationToolkit
   * @param {AnnotationToolset} toolset
   * @param {Object} opts
   */
  constructor(annotationToolkit, toolset, opts) {
    const defaultOpts = {
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

    this.options = Object.assign(defaultOpts, opts);
    this._annotationToolkit = annotationToolkit;
    this._toolset = toolset;

    if (this.options.featureCollections?.length) {
      annotationToolkit.loadGeoJSON(this.options.featureCollections);
    }
  }

  getViewerToolbarButtons() {
    return this._annotationToolkit.getViewerToolbarButtons();
  }

  toggleAnnotationPanels() {
    this._annotationToolkit.toggleAnnotationPanels();
  }

  areAnnotationPanelsVisible() {
    return this._annotationToolkit.areAnnotationPanelsVisible();
  }

  openFileDialog() {
    this._annotationToolkit.openFileDialog();
  }

  /** @deprecated Toolkit owns layout; no-op for compatibility. */
  destroy() {}

  showUI() {
    this.ui?.show();
  }

  hideUI() {
    this.ui?.hide();
  }

  showToolbar() {
    this.toolbar?.show();
  }

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
