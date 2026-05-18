/**
 * Webpack bundle stub for addCSS — styles are injected via importcss.mjs (imports-loader).
 * Must not contain import.meta (classic script hosts parse the whole bundle).
 */

const localImportsCompleted = typeof importedCSS !== 'undefined';

/**
 * @returns {null}
 */
function addCSS() {
    if (localImportsCompleted) {
        return null;
    }
    return null;
}

export { addCSS };
