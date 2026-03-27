/**
 * Bind-time check: `AnnotationItem` subclasses may declare `paperItemShapeContract === 'compoundPath'`.
 */
import { paper } from '../paperjs.mjs';
import { evaluatePaperItemShapeContract } from './paperItemShapeContractCore.mjs';

export { COMPOUND_PATH_CONTRACT_MESSAGE, evaluatePaperItemShapeContract } from './paperItemShapeContractCore.mjs';

/**
 * @param {*} annotationItem
 * @param {paper.Item} paperItem
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validatePaperItemShapeContract(annotationItem, paperItem) {
    const contractKey = annotationItem?.constructor?.paperItemShapeContract;
    return evaluatePaperItemShapeContract(contractKey, paperItem instanceof paper.CompoundPath);
}
