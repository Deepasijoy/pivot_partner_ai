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

## 2. Tableau/Qlik/QlikView/Qlik Sense/Looker have the same single-ID alias gap Power BI just got fixed for

`server/data/esco-custom-aliases.json` aliases "tableau", "qlik",
"qlikview", "qlik sense", and "looker" to the same single ESCO URI as
Power BI used to point at alone — `skill:218` "business intelligence" —
never to `skill:1022` "data visualisation software". This is structurally
the identical bug just fixed for Power BI (see the "power bi"/"power bi
desktop"/"pbi"/"dax"/"power query" dual-ID aliases added above): for
occupations like business analyst/investment analyst/ICT business analyst,
whose essential skill list includes `skill:1022` but not `skill:218`, a
candidate who states Tableau/Qlik/Looker as a skill gets zero credit
toward that essential requirement today.

Not fixed here — deliberately left out of the Power BI fix (explicit
scope decision) and not yet verified end-to-end the way the Power BI case
was (confirmed via scoreJob against both a large-essential-list occupation
and a small-essential-list one). Before applying the same dual-ID fix,
re-run that same verification for each of these five terms rather than
assuming the Excel/Power BI precedent transfers without checking.
