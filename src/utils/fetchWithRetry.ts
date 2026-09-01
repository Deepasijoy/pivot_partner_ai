// Shared fetch helper for every external/network call Career & Income and
// the AI chat path make from the browser: bounds every request with a real
// AbortController timeout (so a hung connection can never leave a promise
// pending forever), retries at most once on a transient failure (network
// error or 5xx), and cleanly distinguishes an INTENTIONAL caller-supplied
// abort (e.g. JobMatcherTab.tsx superseding or unmounting a search) from a
// genuine failure — a deliberate cancellation is never retried and should
// never be reported to the user as a provider error.
//
// Deliberately small: one function, three error types, no queueing/backoff
// scheduler, no circuit breaker. This is a defensive floor under the
// existing provider architecture, not a replacement for it.

// Thrown when the fetch was aborted because of the CALLER's own signal
// (passed in via options.signal) — a real, intentional cancellation, not a
// failure. Callers should treat this specially (e.g. skip setting an error
// state) rather than surfacing it as "the provider failed."
export class FetchAbortError extends Error {
  constructor() {
    super('The request was cancelled.');
    this.name = 'FetchAbortError';
  }
}

// Thrown when every attempt was aborted by THIS helper's own internal
// per-attempt timeout (not the caller's signal) — a genuine, controlled
// failure, distinct from a network error only for clearer messaging.
export class FetchTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms.`);
    this.name = 'FetchTimeoutError';
  }
}

export interface FetchWithRetryOptions extends Omit<RequestInit, 'signal'> {
  // Per-attempt timeout — a retried request gets a fresh timeout window,
  // not a shared budget across attempts.
  timeoutMs?: number;
  // Additional attempts beyond the first. 1 (the default) means "try once,
  // retry once more on a transient failure" — never unbounded.
  maxRetries?: number;
  retryDelayMs?: number;
  // Which non-ok HTTP statuses are worth retrying. Defaults to plain 5xx.
  // A caller can narrow this (e.g. JSearch's proxy route uses 501
  // specifically to mean "not configured," which retrying can never fix).
  isRetryableStatus?: (status: number) => boolean;
  // The CALLER's own cancellation signal (e.g. an AbortController tied to
  // a React effect's lifetime) — separate from the internal per-attempt
  // timeout controller, so the two can be told apart on failure.
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 300;

function defaultIsRetryableStatus(status: number): boolean {
  return status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * fetch() with a bounded per-attempt timeout and at most one retry on a
 * transient failure. Resolves to the Response on success OR on a
 * non-retryable/exhausted-retry failure status (the caller inspects
 * `.ok`/`.status` exactly as it would a plain fetch() call). Throws
 * FetchAbortError when the caller's own `signal` was the cause, or
 * FetchTimeoutError/the original network error once retries are exhausted.
 */
export async function fetchWithRetry(url: string, options: FetchWithRetryOptions = {}): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    isRetryableStatus = defaultIsRetryableStatus,
    signal: externalSignal,
    ...requestInit
  } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (externalSignal?.aborted) {
      throw new FetchAbortError();
    }

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
    const onExternalAbort = () => timeoutController.abort();
    externalSignal?.addEventListener('abort', onExternalAbort);

    try {
      const response = await fetch(url, { ...requestInit, signal: timeoutController.signal });

      const isLastAttempt = attempt === maxRetries;
      if (response.ok || !isRetryableStatus(response.status) || isLastAttempt) {
        return response;
      }

      await delay(retryDelayMs);
      continue;
    } catch (error) {
      if (externalSignal?.aborted) {
        throw new FetchAbortError();
      }

      const classified = isAbortError(error) ? new FetchTimeoutError(timeoutMs) : error;
      const isLastAttempt = attempt === maxRetries;
      if (isLastAttempt) {
        throw classified;
      }

      await delay(retryDelayMs);
      continue;
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  }

  // Unreachable — the loop above always returns or throws — but keeps the
  // return type sound without a non-null assertion at every call site.
  throw new Error('fetchWithRetry: exhausted attempts without a result.');
}
