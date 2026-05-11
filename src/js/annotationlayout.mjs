/**
 * OpenSeadragon paperjs overlay plugin based on paper.js
 * @version 0.6.0
 *
 * Lightweight layout for annotation UI: grid, resize handle, and optional toggle button.
 * Does not depend on AnnotationToolkit or AnnotationUI. Caller provides optional
 * toolbar and/or layerUI refs { element, show(), hide() }.
 */

/**
 * @class AnnotationLayout
 * Builds the annotation grid DOM, places the viewer and optional toolbar/layer UI panels,
 * handles right-panel resize, and optionally adds the single annotation toggle button.
 */
class AnnotationLayout {

  /**
   * @param {OpenSeadragon.Viewer} viewer - OpenSeadragon viewer (use viewer.element and viewer.container).
   * @param {Object} [opts] - All optional.
   * @param {{ element: HTMLElement, show: function, hide: function }|null} [opts.toolbar] - If present, add to top row.
   * @param {{ element: HTMLElement, show: function, hide: function }|null} [opts.layerUI] - If present, add to right column with resize handle.
   * @param {boolean} [opts.addButton=true] - If true, add the pencil/toggle button (requires opts.addViewerButton).
   * @param {function} [opts.addViewerButton] - When addButton is true, called as addViewerButton({ onClick, faIconClass, tooltip }) to create the button. Required if addButton is true.
   * @param {boolean} [opts.buttonTogglesToolbar=true] - Toggle button controls toolbar visibility.
   * @param {boolean} [opts.buttonTogglesLayerUI=true] - Toggle button controls layer UI visibility.
   * @param {boolean} [opts.initialOpen=true] - Initial visibility state for toolbar/layer UI.
   */
  constructor(viewer, opts = {}) {
    this._viewer = viewer;
    this._opts = Object.assign({
      toolbar: null,
      layerUI: null,
      addButton: true,
      addViewerButton: null,
      buttonTogglesToolbar: true,
      buttonTogglesLayerUI: true,
      initialOpen: true,
    }, opts);

    this._isOpen = !!this._opts.initialOpen;
    this._container = null;
    this._resizeRight = null;
    this._resizeHandlers = null;
    this._button = null;

    this._buildGrid();
    if (this._opts.addButton && typeof this._opts.addViewerButton === 'function') {
      this._button = this._opts.addViewerButton({
        onClick: () => this._onToggleClick(),
        faIconClass: 'fa-pencil',
        tooltip: 'Annotation Interface',
      });
    }
  }

  _buildGrid() {
    const container = document.createElement('div');
    this._viewer.element.appendChild(container);
    this._container = container;

    const top = document.createElement('div');
    const bottom = document.createElement('div');
    const center = document.createElement('div');
    const left = document.createElement('div');
    const right = document.createElement('div');
    const resizeRight = document.createElement('div');

    container.classList.add('annotation-ui-grid');
    top.classList.add('top');
    bottom.classList.add('bottom');
    center.classList.add('center');
    left.classList.add('left');
    right.classList.add('right');
    resizeRight.classList.add('resize-right');

    [center, right, left, top, bottom].forEach(div => container.appendChild(div));

    center.appendChild(this._viewer.container);

    if (this._opts.toolbar && this._opts.toolbar.element) {
      top.appendChild(this._opts.toolbar.element);
    }

    if (this._opts.layerUI && this._opts.layerUI.element) {
      right.appendChild(resizeRight);
      right.appendChild(this._opts.layerUI.element);
      this._resizeRight = resizeRight;
      this._wireResize(this._opts.layerUI.element);
    }
  }

  _wireResize(element) {
    const body = document.querySelector('body');
    let offset;
    const moveHandler = (ev) => {
      if (this._resizeRight && this._resizeRight.classList.contains('resizing')) {
        if (ev.movementX) {
          const bounds = element.getBoundingClientRect();
          element.style.width = bounds.right - ev.x - offset + 'px';
        }
        ev.preventDefault();
      }
    };
    const finishResize = () => {
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseleave', finishResize);
      document.removeEventListener('mouseup', finishResize);
      body.classList.remove('annotation-ui-noselect');
      if (this._resizeRight) this._resizeRight.classList.remove('resizing');
    };

    const onMouseDown = (ev) => {
      this._resizeRight.classList.add('resizing');
      body.classList.add('annotation-ui-noselect');
      offset = element.getBoundingClientRect().left - ev.x;
      document.addEventListener('mousemove', moveHandler);
      document.addEventListener('mouseleave', finishResize);
      document.addEventListener('mouseup', finishResize);
    };

    this._resizeRight.addEventListener('mousedown', onMouseDown);
    this._resizeHandlers = { moveHandler, finishResize, onMouseDown };
  }

  _onToggleClick() {
    this._isOpen = !this._isOpen;
    if (this._isOpen) {
      this._opts.buttonTogglesToolbar && this._opts.toolbar && this._opts.toolbar.show();
      this._opts.buttonTogglesLayerUI && this._opts.layerUI && this._opts.layerUI.show();
    } else {
      this._opts.buttonTogglesToolbar && this._opts.toolbar && this._opts.toolbar.hide();
      this._opts.buttonTogglesLayerUI && this._opts.layerUI && this._opts.layerUI.hide();
    }
  }

  /**
   * Remove the grid from the viewer, remove the toggle button, detach listeners.
   * Does not destroy toolbar or layer UI; caller owns those.
   */
  destroy() {
    if (this._button && this._viewer.buttonGroup && this._viewer.buttonGroup.buttons) {
      const idx = this._viewer.buttonGroup.buttons.indexOf(this._button);
      if (idx > -1) this._viewer.buttonGroup.buttons.splice(idx, 1);
      if (this._button.element) this._button.element.remove();
      this._button = null;
    }
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._container = null;
    this._resizeRight = null;
    this._resizeHandlers = null;
  }
}

export { AnnotationLayout };
