// Server-side counterpart to src/utils/fetchWithRetry.ts — same algorithm
// (bounded per-attempt timeout via AbortController, at most one retry on a
// transient failure, never an unbounded retry loop), kept as a separate
// plain-JS implementation rather than a shared cross-runtime import: the
// frontend is Vite/TypeScript-bundled and the server is plain Node ESM, so
// importing one from the other would cross a boundary neither runtime
// expects. Used for every outbound call server.js makes (Groq, Adzuna,
// JSearch) so a slow/hung third-party API can never leave a request
// hanging indefinitely.

export class FetchAbortError extends Error {
  constructor() {
    super('The request was cancelled.')
    this.name = 'FetchAbortError'
  }
}

export class FetchTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`Request timed out after ${timeoutMs}ms.`)
    this.name = 'FetchTimeoutError'
  }
}

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_RETRIES = 1
const DEFAULT_RETRY_DELAY_MS = 300

function defaultIsRetryableStatus(status) {
  return status >= 500
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isAbortError(error) {
  return error instanceof Error && error.name === 'AbortError'
}

/**
 * fetchImpl(url, init) with a bounded per-attempt timeout and at most one
 * retry on a transient failure (network error or, by default, any 5xx
 * status). `fetchImpl` is injected so this stays testable without
 * monkey-patching a global, and so it can wrap `node-fetch` (what
 * server.js actually uses) without this module needing its own dependency
 * on it.
 */
export async function fetchWithRetry(fetchImpl, url, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    isRetryableStatus = defaultIsRetryableStatus,
    signal: externalSignal,
    ...requestInit
  } = options

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (externalSignal?.aborted) {
      throw new FetchAbortError()
    }

    const timeoutController = new AbortController()
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs)
    const onExternalAbort = () => timeoutController.abort()
    externalSignal?.addEventListener('abort', onExternalAbort)

    try {
      const response = await fetchImpl(url, { ...requestInit, signal: timeoutController.signal })

      const isLastAttempt = attempt === maxRetries
      if (response.ok || !isRetryableStatus(response.status) || isLastAttempt) {
        return response
      }

      await delay(retryDelayMs)
      continue
    } catch (error) {
      if (externalSignal?.aborted) {
        throw new FetchAbortError()
      }

      const classified = isAbortError(error) ? new FetchTimeoutError(timeoutMs) : error
      const isLastAttempt = attempt === maxRetries
      if (isLastAttempt) {
        throw classified
      }

      await delay(retryDelayMs)
      continue
    } finally {
      clearTimeout(timeoutId)
      externalSignal?.removeEventListener('abort', onExternalAbort)
    }
  }

  throw new Error('fetchWithRetry: exhausted attempts without a result.')
}
