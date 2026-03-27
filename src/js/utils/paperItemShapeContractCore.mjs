/**
 * Pure paper-item shape contract (no Paper.js dependency) for unit tests and shared messaging.
 */

export const COMPOUND_PATH_CONTRACT_MESSAGE =
    'This annotation expects paper.CompoundPath (rings as children). Plain Path results from boolean ops should be wrapped before assigning paperItem, e.g. new paper.CompoundPath({ children: [path], fillRule: \'evenodd\', closed: true }).';

/**
 * @param {'compoundPath'|null|undefined} contractKey - from `AnnotationItem.constructor.paperItemShapeContract`
 * @param {boolean} isCompoundPath - whether `paperItem instanceof paper.CompoundPath`
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function evaluatePaperItemShapeContract(contractKey, isCompoundPath) {
    if (contractKey !== 'compoundPath') return { ok: true };
    if (isCompoundPath) return { ok: true };
    return { ok: false, message: COMPOUND_PATH_CONTRACT_MESSAGE };
}
