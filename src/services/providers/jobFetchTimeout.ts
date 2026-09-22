// Single source of truth for the frontend's job-provider fetch timeout —
// previously duplicated as an identical `const FETCH_TIMEOUT_MS = ...` in
// jobService.ts and all 5 provider adapters (adzunaProvider.ts,
// arbeitnowProvider.ts, remotiveProvider.ts, himalayasProvider.ts,
// jsearchProvider.ts), which meant changing it required six identical
// edits and made it easy for one copy to drift from the rest.
//
// Bumped from a 10s default to 60s for the same reason chat's own fetch
// timeout was bumped from 20s to 65s (see chatService.ts): three of this
// app's five job providers (Adzuna, Himalayas, JSearch) are proxied
// through this app's own Node backend, not called directly from the
// browser, and that backend runs on a free-tier host that spins down
// after ~15 min idle — its own dashboard warns a cold start "can delay
// requests by 50 seconds or more." A 10s timeout aborts client-side long
// before a cold backend ever gets a chance to wake up and respond, which
// silently empties the live search result and falls back to
// jobsForCareerGuidance()'s mock substrate (see CareerRecommendations.tsx)
// with no indication to the user that anything failed — this was the
// direct, reproducible cause of a real report of fabricated-looking job
// cards on a real resume search. 60s (not chat's 65s): the same wake-up
// cost applies, but a job search never has an LLM generation cost stacked
// on top of it the way chat does, so it needs slightly less headroom —
// still comfortably over the documented "50 seconds or more" bound.
export const JOB_FETCH_TIMEOUT_MS = Number(import.meta.env?.VITE_JOB_FETCH_TIMEOUT_MS) || 60_000;
