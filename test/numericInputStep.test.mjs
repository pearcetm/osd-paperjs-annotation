import assert from 'node:assert/strict';
import { stepFromDisplayedValue, DEFAULT_NUMERIC_INPUT_STEP, MIN_NUMERIC_INPUT_STEP } from '../src/js/utils/numericInputStep.mjs';

assert.equal(stepFromDisplayedValue(''), DEFAULT_NUMERIC_INPUT_STEP);
assert.equal(stepFromDisplayedValue('5'), 1);
assert.equal(stepFromDisplayedValue('0.55'), 0.01);
assert.equal(stepFromDisplayedValue('0.5'), 0.1);
assert.equal(stepFromDisplayedValue('0.23776214'), 1e-8);
assert.equal(stepFromDisplayedValue('0.' + '0'.repeat(20) + '1'), MIN_NUMERIC_INPUT_STEP);

console.log('numericInputStep.test.mjs: ok');
