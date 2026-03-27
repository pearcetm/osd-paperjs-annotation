/**
 * Pure contract logic (no Paper.js). Run: node test/paperItemShapeContractCore.test.mjs
 */
import assert from 'node:assert';
import {
    evaluatePaperItemShapeContract,
    COMPOUND_PATH_CONTRACT_MESSAGE,
} from '../src/js/utils/paperItemShapeContractCore.mjs';

assert.strictEqual(evaluatePaperItemShapeContract(null, false).ok, true);
assert.strictEqual(evaluatePaperItemShapeContract(undefined, false).ok, true);
assert.strictEqual(evaluatePaperItemShapeContract('compoundPath', true).ok, true);
assert.strictEqual(evaluatePaperItemShapeContract('compoundPath', false).ok, false);
assert.strictEqual(
    evaluatePaperItemShapeContract('compoundPath', false).message,
    COMPOUND_PATH_CONTRACT_MESSAGE,
);

console.log('paperItemShapeContractCore tests passed');
