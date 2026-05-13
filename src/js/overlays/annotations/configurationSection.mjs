/**
 * Implementation for the annotations / ConfigurationWidget integration package.
 * Public entry is `attachAnnotationToolkitConfigurationWidget` from `./index.mjs`.
 * Not a ViewerOverlayBase; builds a custom section via ConfigurationWidget.addSection only.
 */

import { makeFaIcon } from '../../utils/faIcon.mjs';
import {
    ANNOTATION_TOOLBAR_PERSIST_ID_FILE,
    ANNOTATION_TOOLBAR_PERSIST_ID_PENCIL,
} from '../configuration/configuration.mjs';

/**
 * Attach the "Annotations" block to a ConfigurationWidget (calls addSection).
 * Does not register with AnnotationToolkit.destroy(); use AnnotationToolkit#registerWithConfigurationWidget for that.
 *
 * @param {OSDPaperjsAnnotation.AnnotationToolkit} annotationToolkit
 * @param {OSDPaperjsAnnotation.ConfigurationWidget} configurationWidget
 * @returns {HTMLElement|null} Root element passed to addSection, or null if nothing was attached
 */
export function attachAnnotationToolkitConfigurationWidget(annotationToolkit, configurationWidget) {
    if (!annotationToolkit || !configurationWidget) return null;
    if (configurationWidget.viewer !== annotationToolkit.viewer) {
        console.warn('[osd-paperjs-annotation] attachAnnotationToolkitConfigurationWidget: configuration widget viewer does not match toolkit viewer.');
        return null;
    }
    const ui = annotationToolkit.annotationUI;
    if (!ui || typeof ui.getViewerToolbarButtons !== 'function') {
        console.warn('[osd-paperjs-annotation] attachAnnotationToolkitConfigurationWidget requires AnnotationToolkit.addAnnotationUI().');
        return null;
    }
    const { pencil, file } = ui.getViewerToolbarButtons();
    if (!pencil && !file) {
        console.warn('[osd-paperjs-annotation] attachAnnotationToolkitConfigurationWidget: no pencil or file toolbar button to configure.');
        return null;
    }

    const root = document.createElement('div');
    root.classList.add('annotation-toolkit-config-section');

    const list = document.createElement('div');
    list.classList.add('config-overlay-list');

    const headingRow = document.createElement('div');
    headingRow.classList.add('config-overlay-heading-row');
    const titleSpacer = document.createElement('span');
    titleSpacer.classList.add('config-heading-title');
    titleSpacer.setAttribute('aria-hidden', 'true');
    titleSpacer.innerHTML = '\u00a0';
    const colHeader = document.createElement('span');
    colHeader.classList.add('config-col-header');
    colHeader.title = 'Include a button directly in the viewer\'s toolbar';
    colHeader.textContent = 'Show Button';
    headingRow.appendChild(titleSpacer);
    headingRow.appendChild(colHeader);
    headingRow.appendChild(document.createElement('span'));
    list.appendChild(headingRow);

    if (pencil?.element) {
        list.appendChild(_makeOverlayStyleRow({
            labelText: 'Annotation interface',
            faIconClass: 'fa-pencil',
            osdButton: pencil,
            configurationWidget,
            kind: 'pencil',
            ui,
        }));
    }
    if (file?.element) {
        list.appendChild(_makeOverlayStyleRow({
            labelText: 'Save / load annotations',
            faIconClass: 'fa-save',
            osdButton: file,
            configurationWidget,
            kind: 'file',
            ui,
        }));
    }

    root.appendChild(list);
    configurationWidget.addSection('Annotations', root);
    return root;
}

/**
 * @param {Object} p
 * @param {string} p.labelText
 * @param {string} p.faIconClass
 * @param {{ element: HTMLElement }} p.osdButton
 * @param {OSDPaperjsAnnotation.ConfigurationWidget} p.configurationWidget
 * @param {'pencil'|'file'} p.kind
 * @param {Object} p.ui - AnnotationUI instance
 */
function _makeOverlayStyleRow(p) {
    const { labelText, faIconClass, osdButton, configurationWidget, kind, ui } = p;
    const row = document.createElement('div');
    row.classList.add('config-overlay-row');

    const iconEl = document.createElement('div');
    iconEl.classList.add('config-overlay-icon');
    iconEl.appendChild(makeFaIcon(faIconClass));

    const labelEl = document.createElement('div');
    labelEl.classList.add('config-overlay-label');
    labelEl.textContent = labelText;

    const toggle = document.createElement('label');
    toggle.classList.add('config-toggle');
    toggle.title = 'Include a button directly in the viewer\'s toolbar';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    const slider = document.createElement('span');
    slider.classList.add('config-toggle-slider');
    toggle.appendChild(checkbox);
    toggle.appendChild(slider);

    const el = osdButton.element;
    const computedDisplay = typeof getComputedStyle !== 'undefined'
        ? getComputedStyle(el).display
        : el.style.display;
    const showDisplay = el.style.display && el.style.display !== 'none'
        ? el.style.display
        : (computedDisplay && computedDisplay !== 'none' ? computedDisplay : 'inline-block');

    const persistId = kind === 'pencil' ? ANNOTATION_TOOLBAR_PERSIST_ID_PENCIL : ANNOTATION_TOOLBAR_PERSIST_ID_FILE;
    let appliedPersisted = false;
    if (configurationWidget.persistToolbarVisibilityEnabled()) {
        const persisted = configurationWidget.getPersistedToolbarVisibility(persistId);
        if (typeof persisted === 'boolean') {
            checkbox.checked = persisted;
            el.style.display = persisted ? showDisplay : 'none';
            appliedPersisted = true;
        }
    }
    if (!appliedPersisted) {
        checkbox.checked = computedDisplay !== 'none';
    }

    checkbox.addEventListener('change', () => {
        el.style.display = checkbox.checked ? showDisplay : 'none';
        if (configurationWidget.persistToolbarVisibilityEnabled()) {
            configurationWidget.setPersistedToolbarVisibility(persistId, checkbox.checked);
        }
    });

    const activateBtn = document.createElement('button');
    activateBtn.type = 'button';
    activateBtn.title = kind === 'pencil' ? 'Open or close annotation panels' : 'Open save and load dialog';

    if (kind === 'pencil') {
        const syncPencilLabel = () => {
            activateBtn.textContent = ui.areAnnotationPanelsVisible() ? 'Close' : 'Open';
        };
        syncPencilLabel();
        activateBtn.addEventListener('click', () => {
            ui.toggleAnnotationPanels();
            syncPencilLabel();
        });
    } else {
        activateBtn.textContent = 'Open';
        activateBtn.addEventListener('click', () => {
            ui.openFileDialog();
            configurationWidget.close();
        });
    }

    row.appendChild(iconEl);
    row.appendChild(labelEl);
    row.appendChild(toggle);
    row.appendChild(activateBtn);
    return row;
}
