import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// server.js exits the process if GROQ_API_KEY is missing at import time —
// same guard as chatRoute.test.js. FRONTEND_URL and the rate-limit env vars
// are set to fixed, small test values BEFORE import so this file gets
// deterministic behavior independent of the developer's real .env, and so
// the rate-limit tests below don't need to fire dozens of requests or wait
// out a real one-minute window.
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-key'
process.env.FRONTEND_URL = 'http://allowed-frontend.test'
process.env.CHAT_RATE_LIMIT_MAX = '2'
process.env.CHAT_RATE_LIMIT_WINDOW_MS = '60000'
process.env.JOBS_RATE_LIMIT_MAX = '3'
process.env.JOBS_RATE_LIMIT_WINDOW_MS = '60000'
process.env.JSEARCH_RATE_LIMIT_MAX = '3'
process.env.JSEARCH_RATE_LIMIT_WINDOW_MS = '60000'

const { app, deps } = await import('../server.js')

let server
let baseUrl

before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
})

function makeSpy(returnValue) {
  const fn = async () => returnValue
  return fn
}

beforeEach(() => {
  deps.callClassifier = makeSpy('ON_TOPIC')
  deps.callMainModel = makeSpy('CANNED_MAIN_MODEL_RESPONSE')
})

// ============================================
// CORS
// ============================================

describe('CORS — only the configured FRONTEND_URL is allowed', () => {
  test('a request from the allowed origin receives Access-Control-Allow-Origin for that origin', async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'http://allowed-frontend.test' },
    })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://allowed-frontend.test')
  })

  test('a request from an unrelated origin does not receive that origin back in Access-Control-Allow-Origin', async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'http://evil-example.test' },
    })
    // The request itself still completes server-side (cors() doesn't block
    // the response body) — what matters is the header a browser relies on
    // to decide whether the calling page may read the response never names
    // the untrusted origin.
    assert.equal(res.status, 200)
    assert.notEqual(res.headers.get('access-control-allow-origin'), 'http://evil-example.test')
  })
})

// ============================================
// RATE LIMITING
// ============================================

describe('rate limiting — HTTP 429 once a route\'s per-IP limit is exceeded', () => {
  test('/api/chat: requests beyond CHAT_RATE_LIMIT_MAX (2) return 429', async () => {
    const post = () =>
      fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'How can I use my skills abroad?' }] }),
      })

    const first = await post()
    const second = await post()
    const third = await post()

    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.equal(third.status, 429)
    const body = await third.json()
    assert.match(body.error, /too many requests/i)
  })

  test('/api/jobs: requests beyond JOBS_RATE_LIMIT_MAX (3) return 429, independent of /api/chat\'s own limit', async () => {
    // Deliberately omits `country` so the handler's own validation
    // short-circuits with 400 before ever calling the real Adzuna API —
    // the rate limiter runs ahead of that validation regardless, so this
    // still exercises real rate-limit counting without depending on
    // network access or real Adzuna credentials being configured.
    const get = () => fetch(`${baseUrl}/api/jobs?what=test`)

    const results = []
    for (let i = 0; i < 4; i++) {
      results.push((await get()).status)
    }

    assert.equal(results[3], 429)
    assert.ok(results.slice(0, 3).every((status) => status !== 429))
  })

  test('/api/jobs/jsearch: requests beyond JSEARCH_RATE_LIMIT_MAX (3) return 429', async () => {
    const get = () => fetch(`${baseUrl}/api/jobs/jsearch?what=test`)

    const results = []
    for (let i = 0; i < 4; i++) {
      results.push((await get()).status)
    }

    assert.equal(results[3], 429)
    assert.ok(results.slice(0, 3).every((status) => status !== 429))
  })

  test('/api/health is not rate-limited', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`${baseUrl}/api/health`)
      assert.equal(res.status, 200)
    }
  })
})
