# Follow-ups

Known issues found during Task 2 (unifying Skill Gaps/Career Paths scoring
with Recommended Paths) that were deliberately left unfixed, out of scope
for that task. Logged here rather than fixed silently.

## 1. `App.tsx`'s `handleJobsResolved` still uses the old, un-unified formula

`App.tsx:127` — the one-shot chat message sent right after a resume upload
calls `matchJobsForUser()` / `generateCareerPaths()` (`matchingService.ts`,
`calculateMatchScore` formula) on `result.jobs`, the same
`primaryJobResult`-shaped data Task 2 moved Skill Gaps/Career Paths away
from. This is the same scoring divergence Task 2 fixed for the UI panels,
just surfacing in the first-impression chat message instead: the "Top
match" the AI announces right after upload can name a different job, or a
different score for the same job, than what Recommended Paths/Skill Gaps
show a moment later on screen.

Fix would mirror Task 2's approach: replace the `matchJobsForUser` call
here with `rankJobsForUser` (`recommendationService.ts`).

## 2. `CareerProfile.tsx`'s hero recommendation reads the wrong pool

`CareerProfile.tsx:24` already uses the correct formula (`scoreJob()`, via
`getCareerRecommendations()`) — so no divergence in the *number* — but it
scores against `primaryJobResult.jobs`, which is `JobMatcherTab.tsx`'s
fixed `local → hybrid → remote` priority (whichever is `source === 'live'`
first), not the jobs from whichever work model(s) the user actually has
selected. With local + remote both selected and both live, the hero can
keep showing a local-derived recommendation even when the user is looking
at remote's stronger results in Recommended Paths below.

Fix would mirror Task 2's `skillAnalysisJobs` derivation in
`JobMatcherTab.tsx` — union the active-workModel pools, rank once, pass
that down instead of `primaryJobResult.jobs`.

## 3. "Live opportunities" badge above Skill Gaps reads the wrong pool (disclosed, not a bug to fix yet)

Task 2 made Skill Gaps' *target job* come from the combined active-pool
ranking, but the `jobSource`/`jobReason` badge next to "Overall market fit"
(`SkillAnalysis.tsx`) still comes from `primaryJobResult.source`/`.reason`.
Edge case: if the local pool is live-but-empty and remote is live-with-
results, the badge can say "Live opportunities" while the actual target
job came from a different pool than the one the badge's live/example
status describes. Noted for awareness; not scheduled — redesigning what a
single badge means when multiple pools can be active at once is a small
product decision, not a mechanical fix.
