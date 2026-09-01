import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePostedAt,
  isRecentlyPosted,
  formatRelativePostedAt,
  comparePostedAtDescending,
  DEFAULT_FRESHNESS_WINDOW_DAYS,
} from '../jobFreshness';

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe('parsePostedAt', () => {
  test('1. a recent, valid ISO date parses successfully', () => {
    const date = parsePostedAt(daysAgoIso(3));
    assert.ok(date instanceof Date);
  });

  test('a valid but old date (e.g. real observed Adzuna ages up to ~591 days) still parses — never rejected on age alone', () => {
    const date = parsePostedAt(daysAgoIso(591));
    assert.ok(date instanceof Date, 'an old-but-real date must still parse — staleness is never treated as malformed');
  });

  test('3. missing postedAt returns null, not a crash', () => {
    assert.equal(parsePostedAt(undefined), null);
    assert.equal(parsePostedAt(null), null);
    assert.equal(parsePostedAt(''), null);
  });

  test('8. a genuinely unparseable string is treated as unknown (null), not an Invalid Date', () => {
    assert.equal(parsePostedAt('not-a-date'), null);
    assert.equal(parsePostedAt('yesterday-ish'), null);
    assert.equal(parsePostedAt('0000-00-00'), null);
  });

  test('8b. a date implausibly far in the future is treated as malformed, not trusted', () => {
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(parsePostedAt(farFuture), null);
  });
});

describe('isRecentlyPosted', () => {
  test('1. a job posted well within the window is recent', () => {
    assert.equal(isRecentlyPosted(daysAgoIso(2), DEFAULT_FRESHNESS_WINDOW_DAYS), true);
  });

  test('2. a job posted well outside the window is not "recent" but is not rejected by this function either — it just returns false', () => {
    assert.equal(isRecentlyPosted(daysAgoIso(200), DEFAULT_FRESHNESS_WINDOW_DAYS), false);
  });

  test('3. a missing date is never "recent" (honest — never guessed as fresh)', () => {
    assert.equal(isRecentlyPosted(undefined), false);
  });

  test('the window is configurable per call', () => {
    assert.equal(isRecentlyPosted(daysAgoIso(10), 7), false);
    assert.equal(isRecentlyPosted(daysAgoIso(10), 14), true);
  });
});

describe('formatRelativePostedAt', () => {
  test('produces an honest, short relative label for a known date', () => {
    assert.equal(formatRelativePostedAt(daysAgoIso(0)), 'Posted today');
    assert.equal(formatRelativePostedAt(daysAgoIso(1)), 'Posted yesterday');
    assert.equal(formatRelativePostedAt(daysAgoIso(3)), 'Posted 3 days ago');
    assert.equal(formatRelativePostedAt(daysAgoIso(14)), 'Posted 2 weeks ago');
    assert.equal(formatRelativePostedAt(daysAgoIso(60)), 'Posted 2 months ago');
  });

  test('3. returns null for a missing date, so a caller can omit the line rather than invent one', () => {
    assert.equal(formatRelativePostedAt(undefined), null);
    assert.equal(formatRelativePostedAt(''), null);
  });

  test('8. returns null for an unparseable date rather than "Posted NaN days ago"', () => {
    assert.equal(formatRelativePostedAt('garbage'), null);
  });
});

describe('comparePostedAtDescending — sorting', () => {
  test('4. two valid dates sort newest first', () => {
    const older = daysAgoIso(10);
    const newer = daysAgoIso(1);
    assert.ok(comparePostedAtDescending(newer, older) < 0);
    assert.ok(comparePostedAtDescending(older, newer) > 0);
  });

  test('4. a job with a known date always sorts ahead of a job with an unknown date', () => {
    assert.ok(comparePostedAtDescending(daysAgoIso(500), undefined) < 0);
    assert.ok(comparePostedAtDescending(undefined, daysAgoIso(500)) > 0);
  });

  test('4. two unknown-date jobs are treated as equal (stable order preserved by the caller\'s sort)', () => {
    assert.equal(comparePostedAtDescending(undefined, undefined), 0);
  });

  test('2. end-to-end sort: known-recent, known-stale, and unknown jobs — recent first, unknown last, nothing dropped', () => {
    const jobs = [
      { id: 'stale', postedAt: daysAgoIso(400) },
      { id: 'unknown', postedAt: undefined },
      { id: 'recent', postedAt: daysAgoIso(1) },
    ];
    const sorted = [...jobs].sort((a, b) => comparePostedAtDescending(a.postedAt, b.postedAt));
    assert.deepEqual(
      sorted.map((j) => j.id),
      ['recent', 'stale', 'unknown']
    );
    assert.equal(sorted.length, jobs.length, 'sorting must never drop a job, including the stale/unknown ones');
  });
});
