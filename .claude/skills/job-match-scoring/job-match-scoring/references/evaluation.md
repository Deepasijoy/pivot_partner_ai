# Evaluating the matcher

Scoring changes are hard to eyeball. A weight tweak that fixes one bad match routinely breaks three good ones, and you will not notice until a user does. A small golden set catches this in seconds.

## The golden set

Ten to twenty real resumes, each with a handful of jobs labelled by a human. Labels are ordinal, not numeric — humans are reliable at "this is a better fit than that" and unreliable at "this is a 68".

```json
{
  "case_id": "bi-analyst-relocating-ghana",
  "resume": "fixtures/resumes/bi_analyst.txt",
  "expectations": [
    { "job": "fixtures/jobs/senior_bi_analyst.json",  "band": "strong" },
    { "job": "fixtures/jobs/data_analyst_remote.json", "band": "strong" },
    { "job": "fixtures/jobs/power_bi_freelance.json",  "band": "strong" },
    { "job": "fixtures/jobs/java_backend.json",        "band": "poor" },
    { "job": "fixtures/jobs/office_assistant.json",    "band": "poor",
      "reason": "over-leveled by 3+ levels; must not outrank analytics roles" }
  ],
  "must_rank_above": [
    ["power_bi_freelance", "office_assistant"],
    ["senior_bi_analyst", "java_backend"]
  ]
}
```

Bands: `strong` (top-tier), `plausible` (reasonable stretch), `poor` (should not surface prominently).

## What the harness asserts

- Every `strong` job scores above every `poor` job for that resume.
- Every pair in `must_rank_above` holds.
- No `poor` job appears in the top three.
- Extraction produces zero malformed tokens: no colons, no trailing brackets, no single-word fragments of known multi-word skills.
- No duplicate canonical IDs in a profile.
- Score is identical across every surface that displays it.
- Every result carries a rationale naming at least one specific term.

Ordering assertions matter more than absolute values. Requiring an exact percentage makes the suite brittle and encourages tuning to the test rather than to reality.

## Seeding the set

Use the maintainer's own resume as case one — it already surfaced several of these failures and the correct answer is known with certainty. Add each real user complaint as a new case, permanently. A bug that has a fixture cannot silently return.

## Run it

Before merging any change to extraction, scoring, or ranking, and **after adding any new job source** — new sources shift IDF weights and re-rank existing results even though no scoring code changed.

Report per-case pass/fail plus, for each failure, the component contribution breakdown for the offending pair. "Java backend outranked BI analyst because title_family_fit returned 0.5 for both" is actionable; "case 3 failed" is not.

## Judgment call

If a case fails and the scorer's reasoning looks defensible, the label may be wrong. Raise it with the maintainer rather than tuning weights until the test goes green — the golden set encodes human judgment, and quietly bending the code to match a bad label degrades the thing you are trying to protect.
