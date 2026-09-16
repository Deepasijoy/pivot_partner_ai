# Follow-ups

Known issues found during Task 2 (unifying Skill Gaps/Career Paths scoring
with Recommended Paths) that were deliberately left unfixed, out of scope
for that task. Logged here rather than fixed silently.

Items 1 and 2 (both scoring-pool divergences) were fixed as part of the
UI/UX bounce-rate pass — see App.tsx's handleJobsResolved (now uses
rankJobsForUser) and JobMatcherTab.tsx's CareerProfile usage (now reads
skillAnalysisJobs). Item 3 remains open, as documented below.

## 1. "Live opportunities" badge above Skill Gaps reads the wrong pool (disclosed, not a bug to fix yet)

Task 2 made Skill Gaps' *target job* come from the combined active-pool
ranking, but the `jobSource`/`jobReason` badge next to "Overall market fit"
(`SkillAnalysis.tsx`) still comes from `primaryJobResult.source`/`.reason`.
Edge case: if the local pool is live-but-empty and remote is live-with-
results, the badge can say "Live opportunities" while the actual target
job came from a different pool than the one the badge's live/example
status describes. Noted for awareness; not scheduled — redesigning what a
single badge means when multiple pools can be active at once is a small
product decision, not a mechanical fix.
