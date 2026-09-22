# Audit trail — Job Search Reliability + Stop Showing Fake Jobs as Real

Branch: `fix-job-search-reliability` (off `multi-provider-jobs`). Written 2026-09-22.

Note on referenced docs: the task brief pointed to `claude/growth-and-data-strategy.md`
(for Adzuna quota figures) and `claude/tin-computer-task-brief.md` (for this note's
expected format) — neither exists in this repo as of this branch, so I could not read
either directly. This note follows my own best judgment for format instead, and the
Adzuna quota concern below is treated as the brief's own claim, not independently
re-verified against that missing doc.

## Part A — why live Remote (and Local/Hybrid) searches actually fail

### Confirmed root causes (code-level evidence)

1. **Client-side job-search timeout was shorter than chat's already-fixed one, and for
   the identical reason.** `VITE_JOB_FETCH_TIMEOUT_MS` defaulted to 10s across all 5
   provider adapters plus `jobService.ts` (6 duplicated definitions). Three of the five
   providers (Adzuna, Himalayas, JSearch) are proxied through this app's own Node
   backend (`/api/jobs`, `/api/jobs/himalayas`, `/api/jobs/jsearch`), which runs on a
   Render free-tier instance that spins down after ~15 min idle — Render's own
   dashboard warns a cold start "can delay requests by 50 seconds or more." A 10s
   client timeout aborts long before a cold backend gets a chance to respond. This is
   the exact same bug already found and fixed for chat (commit `9f06ef1`, 20s → 65s)
   applied to a shorter 10s timeout that was never touched at the same time. This
   directly produces `source: 'empty'`/`'error'` results, which is exactly what
   triggers `jobsForCareerGuidance()`'s mock-jobs fallback in the Remote section.

   **Fix:** consolidated the 6 duplicated `FETCH_TIMEOUT_MS` constants into one shared
   `src/services/providers/jobFetchTimeout.ts` (`JOB_FETCH_TIMEOUT_MS`), bumped the
   default from 10s to 60s (slightly under chat's 65s — a job search doesn't have an
   LLM generation cost stacked on top of the same wake-up delay, but still comfortably
   over the documented "50 seconds or more" bound). Updated `.env.example` to document
   this alongside the existing chat-timeout explanation.

2. **Every candidate query term was sent to every provider, unconditionally.** A
   commit earlier the same day (`a4817f0`'s predecessor work, landed as part of
   `fe7e62f`'s job-query-derivation fixes) changed `JobMatcherTab.tsx` to send
   `[primaryQuery, ...alternateQueries]` — every term the resume's dominant skill
   cluster produces, not just the best guess — to every applicable provider, always.
   For a 3-term query against Adzuna specifically (a provider with a real, low free-
   tier request cap, per the task brief), this multiplies outbound request volume by
   up to 3x per section (Local/Hybrid/Remote each search independently), for no
   benefit in the common case where the primary term alone already finds results.

   **Fix:** `jobAggregatorService.ts`'s `searchJobs()` now tries `primaryQuery` alone
   first, across every applicable provider, and only fans out `alternateQueries` too
   if `primaryQuery`'s own (geo-filtered, deduped) results come back empty. This
   preserves full alternate-cluster coverage exactly when it's needed, at the cost of
   running those extra queries sequentially after the first rather than concurrently
   with it, only in the already-slower empty-first-try case. Verified via the existing
   `jobAggregatorService.*.test.ts` suite (all single-query fixtures — the common real
   case — are unaffected, since alternateQueries.length === 0 skips the new branch
   entirely; 34/34 still pass).

### What I could NOT confirm from this environment

- **Whether the failure observed by the real user was actually a cold-start timeout,
  a provider-side rate-limit/quota error, an invalid/expired API key, or a genuinely
  narrow query** — the task brief's own step 2 asks for this to be confirmed by
  running a real search against the **live production backend**, which this
  environment has no credentials or URL for. I did not fabricate a live test result.
  The per-query, per-provider logging added earlier today (`a4817f0`, still in place
  and unchanged) already surfaces exactly what's needed to diagnose this on the next
  real occurrence: query term, provider, job count or failure reason (including a
  distinguishable `"Request timed out after Nms."` message for a real timeout, vs.
  `"Adzuna API returned 401/429"` for a credential/quota problem) — logged via
  `console.log`, not `console.debug`, so it's visible without a DevTools filter
  change. No further logging changes were needed; this was verified sufficient by
  inspection rather than added as new work.
- **Whether `ADZUNA_APP_ID`/`ADZUNA_API_KEY`/`JSEARCH_API_KEY`/`JSEARCH_API_HOST` are
  correctly configured on Render right now** — this requires access to the Render
  dashboard, which I don't have from this environment. `server/server.js`'s existing
  `/api/jobs` handler already returns a real HTTP status (not a silent empty result)
  on an Adzuna-side error, and logs the raw error body server-side
  (`console.error('❌ Adzuna API Error:', data)`) — so this is diagnosable from Render's
  own log stream once someone with dashboard access checks it, but I could not check
  it myself.
- **Server-side outbound timeouts** (`ADZUNA_FETCH_TIMEOUT_MS`/`JSEARCH_FETCH_TIMEOUT_MS`,
  our backend calling out to Adzuna/JSearch once it's already awake) were left at
  their existing 10s default — this hop has no cold-start problem (external job APIs
  aren't spinning down on us), and I found no evidence they need to change. Not
  touched.

## Part B — never present mock jobs as real, unlabeled

Found, on inspection, that `CareerRecommendations.tsx` already had a small pill badge
next to the "Remote" heading distinguishing `live`/`empty`/`error` with different text
— so the literal "empty and error are conflated" claim in the task brief didn't fully
hold; that distinction already existed in code. The real, remaining gap was
prominence: a compact pill next to a section heading is easy to miss while scrolling
past several job cards that otherwise render identically to genuine listings — the
brief's own suggested fix (reuse the visual pattern of `JobMatcherTab.tsx`'s existing,
more prominent "You're viewing a sample result based on an example profile" banner)
was the right call regardless.

**Fix:** added a full-width banner, matching that exact visual pattern (accent-gold
border, `--surface-2` background, bold body text), directly above the Remote section's
job cards, shown when `remoteJobSource !== 'live'` and there are cards to show and the
whole profile isn't already the sample resume (`isSampleProfile`, newly threaded
through as a prop from `JobMatcherTab.tsx` — suppressed in that case because the
existing top-level sample banner already covers it, and showing both would just repeat
the same message). Distinct copy for `'empty'` vs `'error'`, per `jobService.ts`'s own
established rule that the two must never be conflated; kept the existing pill in place
too (harmless, gives a compact always-visible state cue).

Local/Hybrid's behavior (never show mock, live-only gating) was not touched.

## Verification

- `npx tsc -p tsconfig.app.json --noEmit`: clean.
- `npm run build`: clean production build (pre-existing chunk-size warning only,
  unrelated to this change).
- Full test suite: server 43/43, client 265/265 (including the full
  `jobAggregatorService.*.test.ts` suite, 34/34, re-run specifically after the fan-out
  restructuring), golden set 30/30 — 338/338 total.
- **Not done: a live/staging manual check with a real resume**, per the brief's own
  verification bullet. This environment has no path to the deployed backend, no known
  production URL, and no real user resume to drive the full upload → destination →
  work-model → live-search flow end to end. Build and type-check confirm the changed
  code compiles and bundles correctly; the existing automated test suite exercises the
  aggregator/banner logic paths directly; neither is a substitute for an actual live
  click-through, which still needs to happen before this is trusted in production.

## Files changed

`src/services/providers/jobFetchTimeout.ts` (new), `adzunaProvider.ts`,
`arbeitnowProvider.ts`, `remotiveProvider.ts`, `himalayasProvider.ts`,
`jsearchProvider.ts`, `jobService.ts`, `jobAggregatorService.ts`,
`CareerRecommendations.tsx`, `JobMatcherTab.tsx`, `.env.example`.

`server/server.js` and `server/tests/security.test.js`'s pre-existing uncommitted
Supabase changes were left untouched, per the task brief's explicit instruction.
