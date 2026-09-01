import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { jsearchProvider } from '../jsearchProvider';

// Uses the REAL jsearchProvider.search() (which internally calls the real
// fetchWithRetry with a custom isRetryableStatus excluding 501 — see
// providers/jsearchProvider.ts) against a stubbed global fetch, so this is
// exercising production code end to end, not a reimplementation of its
// retry policy.

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('jsearchProvider — 501 (not configured) is a distinct, non-retryable outcome', () => {
  test('8. a 501 from our own /api/jobs/jsearch proxy resolves after exactly one network call, never retried', async () => {
    let calls = 0;
    globalThis.fetch = (async (url) => {
      calls += 1;
      assert.match(String(url), /\/api\/jobs\/jsearch/);
      return new Response(JSON.stringify({ error: 'not_configured' }), { status: 501 });
    }) as typeof fetch;

    const result = await jsearchProvider.search({ what: 'Data Analyst', workModel: 'remote' });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /not configured/i);
    assert.equal(calls, 1, '501 (not configured) must never trigger a retry — retrying can\'t fix a missing API key');
  });

  test('a genuine transient 5xx from the same route (not 501) IS retried once and can still succeed', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) return new Response(null, { status: 502 });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as typeof fetch;

    const result = await jsearchProvider.search({ what: 'Data Analyst', workModel: 'remote' });

    assert.equal(result.ok, true);
    assert.equal(calls, 2, 'a real transient 5xx (not 501) must still get its one retry');
  });
});
