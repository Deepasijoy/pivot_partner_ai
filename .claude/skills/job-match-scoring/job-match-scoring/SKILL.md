---
name: job-match-scoring
description: Build, fix, or audit the resume-to-job matching and recommendation engine in PivotPartner AI (skill extraction, match percentages, career path ranking, skill-gap analysis, course recommendations). Use this skill whenever the user mentions match scores, match percentages, why a job was recommended, wrong or nonsensical job matches, resume parsing or skill extraction, transferable skills, skill gaps, recommended courses, career paths, or ranking of job results — even if they only say something like "the percentages look wrong" or "why is this job showing up". Also use it before adding a new job source API, since ranking quality degrades silently when the candidate pool changes.
---

# Job Match Scoring

This skill governs the recommendation engine in PivotPartner AI: how a parsed resume becomes a ranked list of jobs, career paths, skill gaps, and course suggestions.

## Why this matters more than it looks

The product's users are experienced professionals who have just lost career continuity through relocation. They are qualified to notice when a match score is wrong. A senior BI analyst told she is a 70% fit for a $31k office assistant role, and that she should go learn Kubernetes, does not think "the algorithm is imperfect" — she thinks the product does not understand her, and she leaves.

So the bar is not "produce a number." The bar is: **a domain expert looking at the top three results and their stated reasons should agree with them.** Every rule below exists because a naive implementation failed that bar in a real session.

## The pipeline

```
resume text
  → extract raw skill strings
  → normalize to canonical skill IDs        [references/skill-normalization.md]
  → build candidate profile (skills, titles, seniority, domains, languages)
  → for each job: apply hard gates          [references/scoring-spec.md]
  → for each surviving job: compute weighted score
  → rank, generate rationale from actual contributors
  → derive skill gaps ONLY from the top-ranked realistic target
  → derive course recommendations ONLY from those gaps
```

Each stage consumes the previous stage's output. **Never let a later stage re-derive something an earlier stage owns.** Most visible bugs in this system are one stage silently recomputing something differently from another.

## Non-negotiables

Treat these as invariants. If a change breaks one, the change is wrong.

**1. One score, computed once.**
Compute the match score in a single function, store it on the match object, and read it everywhere. Job cards, career path panels, summary tiles and chat responses all read the same field. If the job list says 70% and the career panel says 60% for the same role in the same session, the user stops trusting every number on the page — including the correct ones.

**2. Coverage ratio is never the score.**
`matched_skills / skills_listed_in_JD` rewards sparse job descriptions. A two-skill listing you fully match will beat an eight-skill listing you mostly match, so thin, low-quality postings float to the top. Score against *required* skills, weighted by rarity. See `references/scoring-spec.md`.

**3. Skills are weighted by rarity, not counted.**
SQL and Git appear in a large fraction of technical postings and carry almost no signal. Kubernetes, DAX, Solidity carry a lot. Use inverse document frequency computed over the current job corpus so weights adapt as the corpus changes. Two generic matches must never be enough to surface an out-of-family role.

**4. Seniority is two-sided.**
Being far *over*-leveled for a role is a mismatch, not a bonus. Ten years of experience against an entry-level assistant role should reduce the score, not raise it.

**5. Missing a core requirement caps the score.**
If the job's central competency is absent from the profile, the role cannot rank as a strong match no matter how many peripheral skills overlap. A backend Java role with no Java in the profile is capped regardless of SQL and Git.

**6. Rationale is generated from actual contributors.**
Every displayed reason must name the specific terms that drove that specific score. If a sentence appears identically on every card, delete it — a constant carries no information and reads as filler. Never write a rationale the scorer cannot substantiate.

**7. Gaps and courses inherit from a realistic target.**
Skill gaps must be derived from a role the user could plausibly want. If the gap list recommends Kubernetes to a BI specialist, the bug is upstream: a wrong role won the ranking and contaminated everything below it.

**8. No invented timelines.**
"Est. 2 weeks to close" for Kubernetes is not credible and costs trust with exactly the technical users you want. Either use researched, defensible ranges per skill or omit the estimate entirely.

## Working method

**When fixing a reported bad match, always diagnose top-down through the pipeline.** Ask: did extraction produce clean canonical skills? Then: did the gates let this job through? Then: which term contributed the most weight? A wrong result is usually explained at the earliest stage you check, and fixing a downstream symptom while the upstream cause remains produces a different wrong answer next week.

Before changing scoring weights, **log the per-term contributions for the offending match and show them to the user.** Weight tuning without visible contribution breakdowns is guesswork, and the user is the domain expert on whether the ranking is right.

**When adding a job source, re-run the golden set before merging.** New sources shift the IDF distribution and can silently re-rank everything. See `references/evaluation.md`.

## Guarding against the common failure modes

These recur. Check for them specifically.

- **Category prefixes parsed as skills.** A resume line like `Databases: SQL, MySQL` must not yield a skill called "Databases: SQL". Strip the label before splitting.
- **Multi-word skills split on the comma inside them.** "Growth Marketing, Digital Marketing" becoming `Digital` and `Marketing`, or "Team Management" becoming `Team`. Normalize against a canonical list rather than trusting delimiters.
- **Duplicate skills inflating counts.** `Power BI` extracted twice through different resume sections must collapse to one canonical ID.
- **Language mismatch.** A job description written in German should not be offered to a profile with no German, and one employer's postings should not dominate the result set.
- **Remote eligibility asserted rather than checked.** If the listing does not state eligibility for the user's destination, say so plainly rather than implying the role is open to them.

## Reference files

Read the one relevant to the task rather than all three.

- `references/skill-normalization.md` — extraction and canonicalization rules, taxonomy structure, aliasing.
- `references/scoring-spec.md` — the scoring function, weights, hard gates, seniority model, rationale generation.
- `references/evaluation.md` — the golden set: fixture format, how to run it, what "passing" means.

## Definition of done

A change to this engine is done when the golden set passes, the top three results for the maintainer's own resume are defensible by a human reading them, no two panels disagree about the same role's score, and every displayed rationale names terms the scorer actually used.
