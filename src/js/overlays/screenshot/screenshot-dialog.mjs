import { domObjectFromHTML } from '../../utils/domObjectFromHTML.mjs';

/**
 * Returns the HTML string for the screenshot dialog.
 * @returns {string}
 */
export function buildScreenshotDialogHTML(){
    return `<div class="screenshot-dialog hidden">
        <div class="ss-header">
            <div class="ss-title">Screenshot</div>
            <button class="close ss-close" type="button" aria-label="Close">×</button>
        </div>

        <div class="screenshot-setup">
            <div class="screenshot-mode">
                <label class="ss-radio"><input type="radio" name="screenshot-mode" value="free" class="mode-free"> Free select</label>
                <label class="ss-radio"><input type="radio" name="screenshot-mode" value="fixed" class="mode-fixed"> Defined size</label>
            </div>

            <div class="setup-free">
                <div class="ss-row">
                    <label class="ss-check"><input class="lock-aspect-ratio" type="checkbox"/> Use fixed aspect ratio</label>
                    <span class="ss-inline">
                        <span class="ss-muted">Aspect:</span>
                        <input type="number" step="any" inputmode="decimal" value="1" class="aspect-width"/> :
                        <input type="number" step="any" inputmode="decimal" value="1" class="aspect-height"/>
                        <span class="aspect-error ss-muted hidden"></span>
                    </span>
                </div>
                <div class="setup-hint">Start selection, then drag. Esc cancels.</div>
            </div>

            <div class="setup-fixed">
                <div class="ss-row">
                    <span class="ss-muted">Base region:</span>
                    <input class="fixed-base-width" type="number" min="1" step="1" value="256"/> ×
                    <input class="fixed-base-height" type="number" min="1" step="1" value="256"/> <span class="ss-muted">px</span>
                    <span class="fixed-base-error ss-muted hidden"></span>
                </div>
                <div class="ss-row fixed-output-controls">
                    <span class="ss-muted">Output:</span>
                    <select class="select-output-size-fixed"></select>
                    <span class="fixed-output-other hidden">
                        <span class="ss-muted" title="Downsample factor">1 /</span>
                        <input class="fixed-output-other-factor" type="number" step="any" inputmode="decimal" value="1"/>
                        <span class="fixed-output-readout ss-muted"></span>
                        <span class="downsample-error ss-muted hidden"></span>
                    </span>
                    <span class="output-help ss-muted hidden"></span>
                </div>
                <div class="ss-row">
                    <label class="ss-check"><input type="checkbox" class="fixed-auto-create"/> Auto-create on click</label>
                </div>
                <div class="setup-hint">Click Start, then click to place.</div>
            </div>

            <div class="ss-actions">
                <button class="start ss-primary" type="button">Start selection</button>
            </div>
        </div>

        <div class="screenshot-after hidden">
            <div class="ss-section">
                <div class="screenshot-results">
                    <div class="instructions">
                        <div class="ss-row ss-space-between">
                            <div class="output-context ss-muted ss-mono"></div>
                            <button class="edit-region" type="button">Edit</button>
                        </div>
                        <div class="ss-row">
                            <span class="ss-muted">Output:</span>
                            <select class="select-output-size-result"></select>
                            <span class="result-output-other hidden">
                                <span class="ss-muted" title="Downsample factor">1 /</span>
                                <input class="result-output-other-factor" type="number" step="any" inputmode="decimal" value="1"/>
                                <span class="result-output-readout ss-muted"></span>
                                <span class="downsample-error ss-muted hidden"></span>
                            </span>
                        </div>
                        <div class="output-help ss-muted hidden"></div>
                    </div>

                    <div class="scalebar-main hidden">
                        <div class="scalebar-grid">
                            <label class="ss-check scalebar-toggle"><input class="include-scalebar" type="checkbox"> Scale bar</label>
                            <span class="scalebar-disabled-reason ss-muted hidden"></span>

                            <div class="scalebar-opts hidden">
                                <div class="scalebar-row scalebar-length">
                                    <span class="ss-muted">Length</span>
                                    <input class="scalebar-width" type="number" step="any" inputmode="decimal">
                                    <span class="ss-muted ss-unit">mm</span>
                                    <span class="ss-muted scalebar-px-hint"></span>
                                </div>
                                <div class="scalebar-row scalebar-height">
                                    <span class="ss-muted">Height</span>
                                    <input class="scalebar-height" type="number" value="4" step="1" inputmode="numeric">
                                    <span class="ss-muted ss-unit">px</span>
                                </div>
                                <div class="ss-row scalebar-label-row">
                                    <label class="ss-check"><input class="scalebar-show-label" type="checkbox"> Label</label>
                                    <span class="scalebar-label-hint ss-muted hidden"></span>
                                </div>
                                <div class="ss-row scalebar-error-row hidden">
                                    <span class="scalebar-error ss-muted"></span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="ss-row ss-create-row">
                        <span class="ss-create-hint">A region was selected. Next:</span>
                        <button class="create-screenshot ss-primary" type="button">Create</button>
                    </div>

                    <div class="download">
                        <div class="created-confirm ss-muted">Screenshot created.</div>
                        <div class="created-summary ss-muted"></div>
                        <div class="ss-row">
                            <a class="open-screenshot screenshot-link" target="_blank"><button type="button">Open</button></a>
                            <a class="download-screenshot screenshot-link" download="screenshot.png"><button type="button">Download</button></a>
                            <button class="cancel-screenshot" type="button">Change output</button>
                        </div>
                    </div>

                    <div class="pending-message">
                        <div class="ss-row ss-space-between">
                            <span class="ss-muted">Creating…</span>
                            <button class="cancel-screenshot" type="button">Change output</button>
                        </div>
                        <div class="screenshot-progress">
                            <progress></progress>
                            <div class="ss-muted">Loaded <span class="loaded"></span> of <span class="total"><span> tiles</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="ss-footer">
                <button class="back-to-setup" type="button">Back</button>
                <button class="rect" type="button">Select new area</button>
            </div>
        </div>

        <div class="screenshot-edit hidden">
            <div class="ss-section">
                <div class="ss-label">Edit</div>
                <div class="ss-row">
                    <span class="ss-muted">Size:</span>
                    <input class="region-width region-dim" type="number" min="1" step="1"/> ×
                    <input class="region-height region-dim" type="number" min="1" step="1"/> <span class="ss-muted">px</span>
                </div>
                <div class="region-mm ss-muted hidden"></div>
            </div>
            <div class="ss-footer">
                <button class="done-edit" type="button">Done</button>
                <button class="rect" type="button">Select new area</button>
            </div>
        </div>
    </div>`;
}

/**
 * Returns the CSS string for the screenshot dialog.
 * All selectors are scoped to .screenshot-dialog to avoid global leaks.
 * @returns {string}
 */
export function buildScreenshotDialogCSS(){
    return `<style data-type="screenshot-tool">
        .screenshot-dialog{
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            box-sizing: border-box;
            width: min(400px, calc(100% - 24px));
            max-height: calc(100% - 24px);
            overflow: auto;
            background: #fff;
            color: #111;
            border: 1px solid rgba(0,0,0,0.14);
            border-radius: 10px;
            box-shadow: 0 14px 40px rgba(0,0,0,0.22);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 13px;
            line-height: 1.25;
        }
        .screenshot-dialog.hidden{ display:none; }
        .screenshot-dialog .hidden{ display:none !important; }
        .screenshot-dialog .screenshot-after.hidden,
        .screenshot-dialog .screenshot-setup.hidden{ display:none; }

        .ss-header{
            display:flex;
            align-items:center;
            justify-content:space-between;
            padding: 10px 12px;
            border-bottom: 1px solid rgba(0,0,0,0.08);
            position: sticky;
            top: 0;
            background: #fff;
            z-index: 1;
        }
        .ss-title{
            font-weight: 600;
            font-size: 14px;
        }
        .ss-close{
            border: none;
            background: transparent;
            font-size: 18px;
            line-height: 1;
            padding: 2px 6px;
            cursor: pointer;
            color: rgba(0,0,0,0.6);
        }
        .ss-close:hover{ color: rgba(0,0,0,0.9); }

        .screenshot-setup{ padding: 10px 12px; }
        .screenshot-after{ padding: 0 12px; }
        .ss-section{ padding: 4px 0; }
        .ss-footer{
            display:flex;
            gap: 8px;
            padding-top: 4px;
            padding-bottom: 4px;
            border-top: 1px solid rgba(0,0,0,0.08);
        }

        .screenshot-mode{
            display:flex;
            gap: 14px;
            align-items:center;
            margin-bottom: 8px;
        }
        .ss-radio{ display:flex; gap:6px; align-items:center; }
        .ss-check{ display:flex; gap:6px; align-items:center; }
        .ss-row{
            display:flex;
            gap: 8px;
            align-items:center;
            flex-wrap: wrap;
            margin: 1px 0;
        }
        .ss-space-between{ justify-content:space-between; }
        .ss-inline{ display:flex; gap:6px; align-items:center; }
        .ss-label{ font-weight: 600; margin-bottom: 2px; }
        .ss-muted{ color: rgba(0,0,0,0.60); }
        .ss-mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

        .setup-hint{ margin-top: 6px; color: rgba(0,0,0,0.60); }
        .ss-actions{ margin-top: 10px; display:flex; justify-content:flex-end; }

        .screenshot-dialog button{
            font: inherit;
            padding: 5px 10px;
            border: 1px solid rgba(0,0,0,0.18);
            background: #fff;
            border-radius: 8px;
            cursor: pointer;
        }
        .screenshot-dialog button:hover{ border-color: rgba(0,0,0,0.30); }
        .screenshot-dialog button.ss-primary{
            background: #111;
            color: #fff;
            border-color: #111;
        }
        .screenshot-dialog button.ss-primary:hover{ background: #000; border-color: #000; }
        .screenshot-dialog input[type=number]{
            width: 6.5em;
            padding: 4px 6px;
            border: 1px solid rgba(0,0,0,0.18);
            border-radius: 8px;
            font: inherit;
        }
        .scalebar-main input[type=number]{ width: 4.8em; }
        .scalebar-grid{
            display: grid;
            grid-template-columns: 1fr;
            gap: 4px;
            margin: 4px 0;
        }
        .scalebar-toggle{ margin: 0; }
        .scalebar-opts{
            display: grid;
            grid-template-columns: max-content max-content max-content 1fr;
            align-items: center;
            gap: 4px 8px;
        }
        .scalebar-row{ display: contents; }
        .scalebar-opts .ss-row{ margin: 0; }
        .scalebar-label-row{
            grid-column: 1 / -1;
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
            margin: 0;
        }
        .scalebar-label-hint{
            margin-left: auto;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            min-width: 0;
        }
        .scalebar-error-row{
            grid-column: 1 / -1;
            margin-top: 2px;
            margin-left: 0;
            margin-right: 0;
        }
        .scalebar-px-hint{ white-space: nowrap; }
        .ss-unit{ white-space: nowrap; }
        .screenshot-dialog select{
            padding: 4px 6px;
            border: 1px solid rgba(0,0,0,0.18);
            border-radius: 8px;
            font: inherit;
            background: #fff;
        }

        .screenshot-results>*{ display:none; }
        .screenshot-results.created .download{ display:block; }
        .screenshot-results.pending .pending-message{ display:block; }
        .screenshot-results:not(.created):not(.pending) .instructions{ display:block; }
        .screenshot-results.created .scalebar-main{ display:block; }
        .screenshot-results:not(.created):not(.pending) .scalebar-main{ display:block; }
        .screenshot-results:not(.created):not(.pending) .ss-create-row{ display:flex; justify-content:flex-end; align-items:center; gap: 10px; }
        .ss-create-hint{
            color: rgba(0,0,0,0.78);
            font-weight: 500;
        }
    </style>`;
}

/**
 * Injects the screenshot dialog CSS into the document head (once) and
 * creates the dialog DOM element.
 * @returns {HTMLElement} The dialog element
 */
export function createScreenshotDialogElement(){
    if(!document.querySelector('style[data-type="screenshot-tool"]')){
        document.querySelector('head').appendChild(domObjectFromHTML(buildScreenshotDialogCSS()));
    }
    return domObjectFromHTML(buildScreenshotDialogHTML());
}
