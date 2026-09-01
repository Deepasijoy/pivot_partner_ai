import type { WorkModel } from '../types';

// Adds `model` to `workModels` if not already present — a stable, dedup-safe
// state transition: returns the exact SAME array reference when `model` is
// already included, so a caller using this as a React state update never
// triggers an unnecessary re-render or creates a duplicate entry on a
// repeated call (e.g. the user clicking "Explore Remote" more than once).
//
// Extracted out of JobMatcherTab.tsx — which transitively imports
// resumeParserService.ts's Vite-only `?url` asset import, so it can't be
// loaded directly under plain `node --test` — so this one small, pure
// state transition (used by CareerRecommendations.tsx's "Explore Remote"
// fallback) stays directly testable, mirroring why
// industryDetectionService.ts/skillExtractionService.ts were split out the
// same way.
export function addWorkModelIfAbsent(workModels: WorkModel[], model: WorkModel): WorkModel[] {
  return workModels.includes(model) ? workModels : [...workModels, model];
}
