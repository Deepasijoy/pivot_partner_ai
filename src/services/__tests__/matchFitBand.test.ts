import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getMatchFitBand } from '../matchFitBand';

describe('getMatchFitBand — single source of truth for score -> displayed band label', () => {
  test('80-100 -> Strong Fit', () => {
    assert.equal(getMatchFitBand(100), 'Strong Fit');
    assert.equal(getMatchFitBand(80), 'Strong Fit');
  });

  test('55-79 -> Worth Exploring', () => {
    assert.equal(getMatchFitBand(79), 'Worth Exploring');
    assert.equal(getMatchFitBand(55), 'Worth Exploring');
  });

  test('0-54 -> Stretch', () => {
    assert.equal(getMatchFitBand(54), 'Stretch');
    assert.equal(getMatchFitBand(0), 'Stretch');
  });

  // classifyOccupationCompatibility can cap a raw score down to e.g. 30 or
  // 40 (occupationMatchingService.ts's UNRELATED_CAP) before it ever
  // reaches this function — it must land in "Stretch" through the exact
  // same boundary check as any other low score, no special-casing.
  test('a score capped by occupation-compatibility gating (e.g. 30) bands the same as any other low score', () => {
    assert.equal(getMatchFitBand(30), 'Stretch');
    assert.equal(getMatchFitBand(40), 'Stretch');
  });

  test('boundary values on either side of each cutoff resolve to the correct band', () => {
    assert.equal(getMatchFitBand(81), 'Strong Fit');
    assert.equal(getMatchFitBand(56), 'Worth Exploring');
    assert.equal(getMatchFitBand(53), 'Stretch');
  });
});
