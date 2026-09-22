import type { JobFetchSource } from './jobService';

// Pure, side-effect-free decision logic for what CareerRecommendations.tsx
// should render in each work-model section (Local/Hybrid/Remote) — split
// out specifically so it's unit-testable with plain node:test, matching
// this codebase's existing testing convention (no React-rendering test
// infrastructure exists here; every other test in this project is a pure-
// function test, and this keeps that true rather than introducing a new
// framework for one component).
//
// The rule this exists to enforce: a destination is required before a live
// job search can mean anything (see jobAggregatorService.ts/
// locationService.ts) — when one hasn't been resolved yet, NOTHING may be
// presented as a job listing, mock or otherwise. Only once a destination
// exists does the existing live/empty/error distinction apply.

// Remote is the one section that has a mock-data fallback at all
// (jobsForCareerGuidance() in CareerRecommendations.tsx's remoteRecs) — see
// its own 'example' case below. Local/Hybrid never show mock data; see
// decideLocalOrHybridSectionDisplay.
export type RemoteSectionDisplay =
  | { kind: 'needs-destination' }
  | { kind: 'live' }
  | { kind: 'example'; reason: 'empty' | 'error' };

export function decideRemoteSectionDisplay(params: {
  hasDestination: boolean;
  jobSource: JobFetchSource | undefined;
}): RemoteSectionDisplay {
  if (!params.hasDestination) return { kind: 'needs-destination' };
  if (params.jobSource === 'live') return { kind: 'live' };
  if (params.jobSource === 'empty') return { kind: 'example', reason: 'empty' };
  // Covers 'error' and the not-yet-resolved (undefined) case identically —
  // both mean "no confirmed live result", and jobsForCareerGuidance()
  // already treats them the same way (mock substrate) once a destination
  // exists.
  return { kind: 'example', reason: 'error' };
}

// Local/Hybrid never substitute mock data (see CareerRecommendations.tsx's
// own localRecs/hybridRecs gating: live-only, real cards or nothing) — the
// only new case this adds is 'needs-destination', taking priority over the
// existing live/error/empty distinction.
export type LocalOrHybridSectionDisplay = 'needs-destination' | 'live' | 'error' | 'empty';

export function decideLocalOrHybridSectionDisplay(params: {
  hasDestination: boolean;
  jobSource: JobFetchSource | undefined;
  hasJobs: boolean;
}): LocalOrHybridSectionDisplay {
  if (!params.hasDestination) return 'needs-destination';
  if (params.jobSource === 'live' && params.hasJobs) return 'live';
  if (params.jobSource === 'error') return 'error';
  return 'empty';
}
