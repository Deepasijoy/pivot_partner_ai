import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addWorkModelIfAbsent } from '../workModelSelection';
import type { WorkModel } from '../../types';

// Regression: clicking "Explore Remote" from Local's empty-state fallback
// (CareerRecommendations.tsx) previously only toggled a local display
// flag and never added 'remote' to JobMatcherTab.tsx's real workModels
// state — so the Remote useEffect there never ran and no live Remote
// search was ever performed. addWorkModelIfAbsent is the small, pure,
// dedup-safe state transition the fix's onExploreRemote callback uses.

describe('addWorkModelIfAbsent', () => {
  test('Local-only + Explore Remote -> remote is added, local preserved', () => {
    const result = addWorkModelIfAbsent(['local'], 'remote');
    assert.deepEqual(result, ['local', 'remote']);
  });

  test('clicking Explore Remote twice does not create a duplicate remote entry, and is a true no-op the second time', () => {
    const once = addWorkModelIfAbsent(['local'], 'remote');
    const twice = addWorkModelIfAbsent(once, 'remote');
    assert.deepEqual(twice, ['local', 'remote']);
    assert.equal(
      twice,
      once,
      'a no-op call must return the exact same array reference — this is what prevents the Remote useEffect (keyed on workModels) from re-running on a repeated click'
    );
  });

  test('existing Remote selection behavior is unchanged — if remote is already selected, the call is a no-op returning the same reference', () => {
    const workModels: WorkModel[] = ['remote'];
    const result = addWorkModelIfAbsent(workModels, 'remote');
    assert.equal(result, workModels);
  });

  test('existing Local behavior is unchanged — adding remote never removes or reorders local', () => {
    const result = addWorkModelIfAbsent(['local'], 'remote');
    assert.ok(result.includes('local'), 'local must still be present');
    assert.equal(result[0], 'local', 'local must not be displaced');
  });

  test('a genuinely empty workModels array still gets remote added', () => {
    assert.deepEqual(addWorkModelIfAbsent([], 'remote'), ['remote']);
  });

  test('a multi-model selection (local + hybrid) keeps every existing model when remote is added', () => {
    const result = addWorkModelIfAbsent(['local', 'hybrid'], 'remote');
    assert.deepEqual(result, ['local', 'hybrid', 'remote']);
  });
});
