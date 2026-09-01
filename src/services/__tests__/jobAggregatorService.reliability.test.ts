import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { searchJobs } from '../jobAggregatorService';

// Exercises the REAL searchJobs() aggregator plus the REAL provider
// adapters (adzunaProvider, arbeitnowProvider, remotiveProvider,
// jsearchProvider) against a stubbed global fetch routed by URL — proving
// the reliability layer (timeouts/retry/cancellation) holds at the actual
// integration point Career & Income depends on, not just at the shared
// helper's own unit level.

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function abortError(): Error {
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

describe('searchJobs — provider isolation (10)', () => {
  test('one provider persistently failing does not prevent the others from returning jobs', async () => {
    globalThis.fetch = (async (url, init) => {
      const href = String(url);

      // Adzuna (our own /api/jobs proxy) — persistent network failure.
      if (href.includes('/api/jobs?')) {
        throw new TypeError('Failed to fetch');
      }

      // JSearch (our own /api/jobs/jsearch proxy) — "not configured".
      if (href.includes('/api/jobs/jsearch')) {
        return new Response(JSON.stringify({ error: 'not_configured' }), { status: 501 });
      }

      // Arbeitnow — succeeds with one relevant, remote-tagged job.
      if (href.includes('arbeitnow.com')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                slug: 'remote-data-analyst-acme',
                company_name: 'Acme Corp',
                title: 'Remote Data Analyst',
                description: 'Analyze things.',
                remote: true,
                url: 'https://arbeitnow.com/jobs/remote-data-analyst-acme',
                location: 'Anywhere',
                created_at: 1_700_000_000,
              },
            ],
          }),
          { status: 200 }
        );
      }

      // Remotive — succeeds with one job eligible for the destination.
      if (href.includes('remotive.com')) {
        return new Response(
          JSON.stringify({
            jobs: [
              {
                id: 1,
                url: 'https://remotive.com/jobs/1',
                title: 'Remote Data Analyst',
                company_name: 'Beta Inc',
                candidate_required_location: 'United Kingdom',
                description: 'Analyze more things.',
              },
            ],
          }),
          { status: 200 }
        );
      }

      init?.signal?.addEventListener('abort', () => {});
      throw new Error(`Unexpected fetch: ${href}`);
    }) as typeof fetch;

    const result = await searchJobs({
      what: 'Data Analyst',
      destinationCountry: 'gb',
      destinationCountryName: 'United Kingdom',
      workModel: 'remote',
    });

    assert.equal(result.source, 'live', 'two providers succeeded — this must be a live result, not error/empty');
    assert.ok(result.jobs.length >= 2, `expected jobs from both successful providers, got ${result.jobs.length}`);

    const failed = result.providerResults.filter((r) => !r.ok);
    const succeeded = result.providerResults.filter((r) => r.ok);
    assert.ok(failed.some((r) => r.source === 'adzuna'));
    assert.ok(failed.some((r) => r.source === 'jsearch'));
    assert.ok(succeeded.some((r) => r.source === 'arbeitnow'));
    assert.ok(succeeded.some((r) => r.source === 'remotive'));
  });

  test('final production check: a persistent HTTP 5xx, a malformed response, and JSearch "not configured" all fail simultaneously — the one remaining healthy provider still produces a live result, never a false "no jobs"', async () => {
    globalThis.fetch = (async (url) => {
      const href = String(url);

      // Adzuna: a genuine persistent 5xx. fetchWithRetry retries once, so
      // every call must fail the same way for this to actually exhaust —
      // a single-shot 502 would otherwise "recover" on the retry.
      if (href.includes('/api/jobs?')) {
        return new Response(JSON.stringify({ error: 'upstream unavailable' }), { status: 502 });
      }

      // JSearch: not configured (the real, documented 501 contract).
      if (href.includes('/api/jobs/jsearch')) {
        return new Response(JSON.stringify({ error: 'not_configured' }), { status: 501 });
      }

      // Arbeitnow: a malformed schema (data present but not an array) —
      // a provider-side API change, not a network-level failure.
      if (href.includes('arbeitnow.com')) {
        return new Response(JSON.stringify({ data: 'not-an-array' }), { status: 200 });
      }

      // Remotive: the sole healthy provider.
      if (href.includes('remotive.com')) {
        return new Response(
          JSON.stringify({
            jobs: [
              {
                id: 42,
                url: 'https://remotive.com/jobs/42',
                title: 'Remote Data Analyst',
                company_name: 'Healthy Co',
                candidate_required_location: 'United Kingdom',
                description: 'Analyze data at Healthy Co.',
              },
            ],
          }),
          { status: 200 }
        );
      }

      throw new Error(`Unexpected fetch: ${href}`);
    }) as typeof fetch;

    const result = await searchJobs({
      what: 'Data Analyst',
      destinationCountry: 'gb',
      destinationCountryName: 'United Kingdom',
      workModel: 'remote',
    });

    assert.equal(result.source, 'live', 'one healthy provider must still yield a live result, not error/empty');
    assert.ok(result.jobs.some((j) => j.company === 'Healthy Co'), 'the healthy provider\'s real job must be present');

    const bySource = Object.fromEntries(result.providerResults.map((r) => [r.source, r]));
    assert.equal(bySource.adzuna.ok, false, 'a persistent 5xx must be reported as failed, not silently swallowed');
    assert.match(bySource.adzuna.error ?? '', /502|5\d\d/);
    assert.equal(bySource.jsearch.ok, false);
    assert.match(bySource.jsearch.error ?? '', /not configured/i);
    assert.equal(bySource.arbeitnow.ok, false, 'a malformed schema must be a controlled failure, not a crash');
    assert.match(bySource.arbeitnow.error ?? '', /malformed/i);
    assert.equal(bySource.remotive.ok, true);
  });

  test('if every provider fails, the aggregate reports the existing controlled error state — never a fake empty success', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    const result = await searchJobs({
      what: 'Data Analyst',
      destinationCountry: 'gb',
      destinationCountryName: 'United Kingdom',
      workModel: 'remote',
    });

    assert.equal(result.source, 'error');
    assert.equal(result.jobs.length, 0);
  });
});

describe('searchJobs — supersession / cancellation (11, 12)', () => {
  test('12. no provider hanging indefinitely can stall the aggregate — the whole search still resolves', async () => {
    globalThis.fetch = (async (url, init) => {
      const href = String(url);

      // Adzuna hangs forever unless aborted — exactly like a real hung
      // connection. Everything else fails fast so this test stays quick;
      // the point is proving the AGGREGATE as a whole cannot be stalled
      // by this one provider (see fetchWithRetry.test.ts's own timeout
      // tests for the underlying per-request bound).
      if (href.includes('/api/jobs?')) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(abortError()));
        });
      }
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    const start = Date.now();
    const result = await searchJobs({
      what: 'Data Analyst',
      destinationCountry: 'gb',
      destinationCountryName: 'United Kingdom',
      workModel: 'remote',
      // Overrides the provider's real ~10s production default so this
      // test exercises the actual timeout mechanism, end to end through
      // the aggregator, without waiting out that full duration — the
      // mechanism itself is identical at any timeoutMs value.
      timeoutMs: 40,
    });
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 2000, `the aggregate must resolve, not hang — took ${elapsed}ms`);
    assert.equal(result.source, 'error');
  });

  test('11. a search superseded by AbortController is verifiably cancelled at the network layer, not silently left running', async () => {
    const controllerA = new AbortController();
    let requestAAborted = false;

    globalThis.fetch = (async (url, init) => {
      const href = String(url);
      if (href.includes('/api/jobs?')) {
        // Simulates the slow, in-flight search that gets superseded.
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            requestAAborted = true;
            reject(abortError());
          });
        });
      }
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    // Mirrors JobMatcherTab.tsx's own effect pattern exactly: a `cancelled`
    // flag guards which result is ever applied, and the same cleanup that
    // sets it also aborts the real in-flight request.
    let cancelled = false;
    let applied: string | null = null;

    const searchAPromise = searchJobs({
      what: 'Data Analyst',
      destinationCountry: 'gb',
      workModel: 'remote',
      signal: controllerA.signal,
    }).then((result) => {
      if (!cancelled) applied = `A:${result.source}`;
    });

    // The effect is superseded — exactly what happens when the user
    // changes work models or navigates away mid-search.
    cancelled = true;
    controllerA.abort();

    await searchAPromise;

    assert.equal(applied, null, 'a superseded search result must never be applied to state');
    assert.equal(requestAAborted, true, 'the underlying network request must actually be cancelled, not merely ignored');
  });

  test('final production check: independent Local/Remote searches use independent AbortControllers — cancelling one never touches the other', async () => {
    // Mirrors JobMatcherTab.tsx's real structure exactly: Local and Remote
    // are two fully independent useEffects, each owning its own
    // AbortController and its own `cancelled` guard flag — changing one
    // work model's selection (and so aborting its own controller) must
    // never abort or discard the other's in-flight search.
    const localController = new AbortController();
    const remoteController = new AbortController();
    let localRequestAborted = false;
    let remoteRequestAborted = false;

    globalThis.fetch = (async (url, init) => {
      const href = String(url);
      // Local search targets Adzuna with `where` set; Remote omits it —
      // route each to a distinguishable in-flight promise via that.
      if (href.includes('/api/jobs?') && href.includes('where=')) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            localRequestAborted = true;
            reject(abortError());
          });
        });
      }
      if (href.includes('/api/jobs?')) {
        init?.signal?.addEventListener('abort', () => {
          remoteRequestAborted = true;
        });
        // Remote's Adzuna call resolves normally, never aborted in this test.
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      if (href.includes('remotive.com')) {
        init?.signal?.addEventListener('abort', () => {
          remoteRequestAborted = true;
        });
        return new Response(
          JSON.stringify({
            jobs: [
              {
                id: 7,
                url: 'https://remotive.com/jobs/7',
                title: 'Remote Data Analyst',
                company_name: 'Still Running Co',
                candidate_required_location: 'Worldwide',
                description: 'Still here.',
              },
            ],
          }),
          { status: 200 }
        );
      }
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    let localCancelled = false;
    let localApplied: string | null = null;
    const localPromise = searchJobs({
      what: 'Data Analyst',
      destinationCity: 'Berlin',
      destinationCountry: 'gb',
      destinationCountryName: 'United Kingdom',
      workModel: 'local',
      signal: localController.signal,
    }).then((result) => {
      if (!localCancelled) localApplied = `local:${result.source}`;
    });

    let remoteApplied: string | null = null;
    const remotePromise = searchJobs({
      what: 'Data Analyst',
      destinationCountry: 'gb',
      destinationCountryName: 'United Kingdom',
      workModel: 'remote',
      signal: remoteController.signal,
    }).then((result) => {
      remoteApplied = `remote:${result.source}`;
    });

    // The user deselects "Local" (or navigates away) — only Local's own
    // controller/cleanup fires, exactly like one useEffect's cleanup.
    localCancelled = true;
    localController.abort();

    await Promise.all([localPromise, remotePromise]);

    assert.equal(localRequestAborted, true, 'Local\'s own in-flight request must actually be cancelled');
    assert.equal(localApplied, null, 'Local\'s superseded result must never be applied');
    assert.equal(remoteRequestAborted, false, 'Remote\'s independent request must never be touched by Local\'s cancellation');
    assert.equal(remoteApplied, 'remote:live', 'Remote\'s own search must complete normally and be applied, unaffected by Local');
  });
});
