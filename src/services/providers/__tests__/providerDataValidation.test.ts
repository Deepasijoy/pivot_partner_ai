import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { adzunaProvider } from '../adzunaProvider';
import { arbeitnowProvider } from '../arbeitnowProvider';
import { remotiveProvider } from '../remotiveProvider';
import { jsearchProvider } from '../jsearchProvider';

// Exercises the real provider modules' search() against a stubbed global
// fetch — proving the actual production validation (blank-title rejection,
// malformed-array handling) rather than reimplementing it.

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('9. a listing with a blank/missing title is rejected before it can reach the UI', () => {
  test('adzunaProvider drops a result with an empty title, keeps a valid one', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          results: [
            { id: 1, title: '', company: { display_name: 'Blank Co' }, redirect_url: 'https://example.com/1' },
            { id: 2, title: '  ', company: { display_name: 'Whitespace Co' }, redirect_url: 'https://example.com/2' },
            { id: 3, title: 'Data Analyst', company: { display_name: 'Real Co' }, redirect_url: 'https://example.com/3' },
          ],
        }),
        { status: 200 }
      )) as typeof fetch;

    const result = await adzunaProvider.search({ what: 'Data Analyst', destinationCountry: 'fr', workModel: 'local' });
    assert.equal(result.ok, true);
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].title, 'Data Analyst');
  });

  test('arbeitnowProvider drops a result with an empty title, keeps a valid one', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: [
            { slug: 'blank', company_name: 'Blank Co', title: '', description: '', remote: true, url: 'https://example.com/1', location: 'Anywhere', created_at: 1_700_000_000 },
            { slug: 'real', company_name: 'Real Co', title: 'Remote Data Analyst', description: '', remote: true, url: 'https://example.com/2', location: 'Anywhere', created_at: 1_700_000_000 },
          ],
        }),
        { status: 200 }
      )) as typeof fetch;

    const result = await arbeitnowProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(result.ok, true);
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].title, 'Remote Data Analyst');
  });

  test('remotiveProvider drops a result with an empty title, keeps a valid one', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          jobs: [
            { id: 1, url: 'https://example.com/1', title: '', company_name: 'Blank Co' },
            { id: 2, url: 'https://example.com/2', title: 'Data Analyst', company_name: 'Real Co' },
          ],
        }),
        { status: 200 }
      )) as typeof fetch;

    const result = await remotiveProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(result.ok, true);
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].title, 'Data Analyst');
  });

  test('jsearchProvider drops a result with an empty title, keeps a valid one', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: [
            { job_id: '1', job_title: '', employer_name: 'Blank Co' },
            { job_id: '2', job_title: 'Data Analyst', employer_name: 'Real Co' },
          ],
        }),
        { status: 200 }
      )) as typeof fetch;

    const result = await jsearchProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(result.ok, true);
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].title, 'Data Analyst');
  });
});

describe('10. a listing with no application URL is retained, not dropped', () => {
  test('adzunaProvider keeps a job with no redirect_url', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ results: [{ id: 1, title: 'Data Analyst', company: { display_name: 'Real Co' } }] }),
        { status: 200 }
      )) as typeof fetch;

    const result = await adzunaProvider.search({ what: 'Data Analyst', destinationCountry: 'fr', workModel: 'local' });
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].applicationUrl, undefined);
  });
});

describe('12. a malformed provider response is a controlled failure, not a crash', () => {
  test('adzunaProvider: results present but not an array', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ results: 'not-an-array' }), { status: 200 })) as typeof fetch;
    const result = await adzunaProvider.search({ what: 'Data Analyst', destinationCountry: 'fr', workModel: 'local' });
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /malformed/i);
  });

  test('arbeitnowProvider: data present but not an array', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ data: { unexpected: true } }), { status: 200 })) as typeof fetch;
    const result = await arbeitnowProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /malformed/i);
  });

  test('remotiveProvider: jobs present but not an array', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ jobs: 'oops' }), { status: 200 })) as typeof fetch;
    const result = await remotiveProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /malformed/i);
  });

  test('jsearchProvider: data present but not an array', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ data: 42 }), { status: 200 })) as typeof fetch;
    const result = await jsearchProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /malformed/i);
  });

  test('a malformed response from one provider does not throw — it resolves cleanly like any other failure', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ results: 'garbage' }), { status: 200 })) as typeof fetch;
    await assert.doesNotReject(() => adzunaProvider.search({ what: 'Data Analyst', destinationCountry: 'fr', workModel: 'local' }));
  });
});
