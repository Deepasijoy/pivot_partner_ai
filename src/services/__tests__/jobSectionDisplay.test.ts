import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decideRemoteSectionDisplay, decideLocalOrHybridSectionDisplay } from '../jobSectionDisplay';

// Covers the specific behavior fix this file exists for: "no search fires
// with empty destination; empty-destination state shows the message, not
// mock cards" — the pure decision layer CareerRecommendations.tsx renders
// from. No React-rendering test infrastructure exists in this project
// (every other test here is a pure-function node:test, matching this file's
// own approach), so this tests the actual decision logic directly rather
// than a rendered DOM.

describe('decideRemoteSectionDisplay — Remote is the one section with a mock fallback', () => {
  test('no destination resolved -> needs-destination, regardless of jobSource', () => {
    assert.deepEqual(decideRemoteSectionDisplay({ hasDestination: false, jobSource: undefined }), {
      kind: 'needs-destination',
    });
    // Even a stale/impossible 'live' jobSource must not leak real-looking
    // cards through once hasDestination is false — needs-destination wins.
    assert.deepEqual(decideRemoteSectionDisplay({ hasDestination: false, jobSource: 'live' }), {
      kind: 'needs-destination',
    });
    assert.deepEqual(decideRemoteSectionDisplay({ hasDestination: false, jobSource: 'empty' }), {
      kind: 'needs-destination',
    });
    assert.deepEqual(decideRemoteSectionDisplay({ hasDestination: false, jobSource: 'error' }), {
      kind: 'needs-destination',
    });
  });

  test('destination resolved + live jobs -> live', () => {
    assert.deepEqual(decideRemoteSectionDisplay({ hasDestination: true, jobSource: 'live' }), { kind: 'live' });
  });

  test('destination resolved + empty result -> example with reason "empty", never conflated with error', () => {
    assert.deepEqual(decideRemoteSectionDisplay({ hasDestination: true, jobSource: 'empty' }), {
      kind: 'example',
      reason: 'empty',
    });
  });

  test('destination resolved + error result -> example with reason "error"', () => {
    assert.deepEqual(decideRemoteSectionDisplay({ hasDestination: true, jobSource: 'error' }), {
      kind: 'example',
      reason: 'error',
    });
  });

  test('destination resolved + search not yet resolved (undefined jobSource) -> example, not needs-destination', () => {
    assert.deepEqual(decideRemoteSectionDisplay({ hasDestination: true, jobSource: undefined }), {
      kind: 'example',
      reason: 'error',
    });
  });
});

describe('decideLocalOrHybridSectionDisplay — Local/Hybrid never have a mock fallback', () => {
  test('no destination resolved -> needs-destination, regardless of jobSource/hasJobs', () => {
    assert.equal(
      decideLocalOrHybridSectionDisplay({ hasDestination: false, jobSource: undefined, hasJobs: false }),
      'needs-destination'
    );
    assert.equal(
      decideLocalOrHybridSectionDisplay({ hasDestination: false, jobSource: 'live', hasJobs: true }),
      'needs-destination'
    );
  });

  test('destination resolved + live jobs present -> live', () => {
    assert.equal(
      decideLocalOrHybridSectionDisplay({ hasDestination: true, jobSource: 'live', hasJobs: true }),
      'live'
    );
  });

  test('destination resolved + live source but zero jobs -> empty, not live (no cards to show)', () => {
    assert.equal(
      decideLocalOrHybridSectionDisplay({ hasDestination: true, jobSource: 'live', hasJobs: false }),
      'empty'
    );
  });

  test('destination resolved + error -> error', () => {
    assert.equal(
      decideLocalOrHybridSectionDisplay({ hasDestination: true, jobSource: 'error', hasJobs: false }),
      'error'
    );
  });

  test('destination resolved + empty -> empty', () => {
    assert.equal(
      decideLocalOrHybridSectionDisplay({ hasDestination: true, jobSource: 'empty', hasJobs: false }),
      'empty'
    );
  });
});
