import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithRetry, FetchAbortError, FetchTimeoutError } from '../fetchWithRetry';

function abortError(): Error {
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

// Mimics real fetch()'s AbortController contract exactly: never
// resolves/rejects on its own, only rejects with an AbortError once the
// request's own signal fires — so tests exercise the real detection logic
// in fetchWithRetry (distinguishing "my own timeout fired" from "the
// caller's external signal fired"), not a simplified stand-in for it.
function neverSettles(): typeof fetch {
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(abortError()));
    });
  }) as typeof fetch;
}

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('fetchWithRetry — timeout', () => {
  test('1. a request that never resolves is aborted once timeoutMs elapses', async () => {
    let sawAbort = false;
    globalThis.fetch = (async (_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          sawAbort = true;
          reject(abortError());
        });
      });
    }) as typeof fetch;

    await assert.rejects(
      () => fetchWithRetry('https://example.test', { timeoutMs: 30, maxRetries: 0 }),
      (err: unknown) => err instanceof FetchTimeoutError
    );
    assert.equal(sawAbort, true, 'the underlying request must actually receive the abort signal');
  });

  test('12. a request that never settles on its own is still bounded (proves nothing can hang indefinitely)', async () => {
    globalThis.fetch = neverSettles();

    const start = Date.now();
    await assert.rejects(
      () => fetchWithRetry('https://example.test', { timeoutMs: 40, maxRetries: 0 }),
      (err: unknown) => err instanceof FetchTimeoutError
    );
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 2000, `expected a bounded failure well under 2s, took ${elapsed}ms`);
  });
});

describe('fetchWithRetry — intentional cancellation', () => {
  test('2. an external AbortSignal is recognized as cancellation, not a failure', async () => {
    const controller = new AbortController();
    globalThis.fetch = neverSettles();

    const promise = fetchWithRetry('https://example.test', { signal: controller.signal, timeoutMs: 5000 });
    controller.abort();

    await assert.rejects(() => promise, (err: unknown) => err instanceof FetchAbortError);
  });

  test('9. an intentional cancellation is never retried', async () => {
    const controller = new AbortController();
    let calls = 0;
    globalThis.fetch = (async (_url, init) => {
      calls += 1;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(abortError()));
      });
    }) as typeof fetch;

    const promise = fetchWithRetry('https://example.test', { signal: controller.signal, retryDelayMs: 1 });
    controller.abort();

    await assert.rejects(() => promise, (err: unknown) => err instanceof FetchAbortError);
    assert.equal(calls, 1, 'a cancelled request must not trigger a retry attempt');
  });
});

describe('fetchWithRetry — bounded retry on transient failures', () => {
  test('3 & 5. a transient HTTP 500 retries once and succeeds on the second attempt', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return calls === 1 ? new Response(null, { status: 500 }) : new Response(null, { status: 200 });
    }) as typeof fetch;

    const response = await fetchWithRetry('https://example.test', { retryDelayMs: 1 });
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
  });

  test('4 & 5. a transient network failure retries once and succeeds on the second attempt', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('Failed to fetch');
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const response = await fetchWithRetry('https://example.test', { retryDelayMs: 1 });
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
  });

  test('6. a persistent HTTP 500 exhausts the single retry and returns the last failed response, never more than one retry', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(null, { status: 500 });
    }) as typeof fetch;

    const response = await fetchWithRetry('https://example.test', { retryDelayMs: 1 });
    assert.equal(response.status, 500);
    assert.equal(calls, 2, 'exactly one original attempt plus one retry — never an unbounded loop');
  });

  test('6. a persistent network failure exhausts the single retry and throws a controlled error, never more than one retry', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    await assert.rejects(
      () => fetchWithRetry('https://example.test', { retryDelayMs: 1 }),
      (err: unknown) => err instanceof TypeError
    );
    assert.equal(calls, 2);
  });

  test('7. HTTP 400 is returned immediately, never retried', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(null, { status: 400 });
    }) as typeof fetch;

    const response = await fetchWithRetry('https://example.test', { retryDelayMs: 1 });
    assert.equal(response.status, 400);
    assert.equal(calls, 1);
  });

  test('8. a caller-supplied isRetryableStatus can exclude a status that would otherwise be retried (the JSearch 501 case)', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(null, { status: 501 });
    }) as typeof fetch;

    const response = await fetchWithRetry('https://example.test', {
      retryDelayMs: 1,
      isRetryableStatus: (status) => status >= 500 && status !== 501,
    });
    assert.equal(response.status, 501);
    assert.equal(calls, 1, '501 must not be retried when the caller excludes it');
  });
});
