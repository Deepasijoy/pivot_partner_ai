# Scoring specification

Assumes normalized canonical skills on both sides. If extraction is still emitting malformed tokens, fix that first — tuning weights over bad inputs produces confidently wrong results.

## Order of operations

1. Hard gates — eliminate or cap. Cheap, so run first.
2. Component scores — each returns 0..1.
3. Weighted sum → 0..100.
4. Caps applied.
5. Rationale generated from the recorded contributions.

Record every component's raw value and its contribution to the total. The rationale and any debugging both depend on this; without it you cannot answer "why did this rank here", which is the question that matters most.

## Hard gates

Gates encode facts that no amount of skill overlap should override.

| Condition | Action |
|---|---|
| JD language not in candidate's languages | Drop |
| Core required skill absent (see below) | Cap at 35 |
| Seniority delta ≤ −2 levels (badly over-leveled) | Cap at 40 |
| Seniority delta ≥ +2 levels (badly under-leveled) | Cap at 45 |
| Role family unrelated to any candidate family | Cap at 40 |
| Posting older than 60 days | Deprioritize in ranking, not in score |

**Identifying core requirements.** Prefer explicit signals: the skill named in the job title, skills under a "requirements" or "must have" heading, skills mentioned three or more times. Falling back to "first three listed skills" is acceptable but weak — log when you use the fallback so you know how often ranking rests on a guess.

**Cap, don't zero.** A capped role can still be shown honestly as a stretch, which is useful. Zeroing hides information; capping communicates it.

## Components

Suggested weights. Tune against the golden set, not intuition.

```
score = 100 * (
    0.35 * skill_match          // IDF-weighted recall over required skills
  + 0.20 * title_family_fit     // is this the same kind of job
  + 0.15 * domain_fit           // industry overlap
  + 0.15 * seniority_fit        // two-sided
  + 0.15 * location_fit         // remote eligibility / destination
)
```

### skill_match — IDF-weighted recall

For each required skill in the JD, weight it by rarity across the current job corpus:

```
idf(s) = log(N_jobs / (1 + jobs_containing(s)))

skill_match = Σ over required skills of ( idf(s) * credit(s) * recency_factor(s) )
              ────────────────────────────────────────────────────────────────────
                              Σ over required skills of idf(s)
```

`credit(s)` is 1.0 for an exact or alias match, 0.6 for parent/child, 0.4 for a related sibling, 0 for absent. `recency_factor` decays a skill unused for many years — suggest 1.0 for under two years, tapering to about 0.7 beyond eight.

**Recompute IDF whenever the job corpus changes materially.** Adding a new source shifts these weights and re-ranks everything. Cache it, version it, and note the corpus size it was computed from.

Preferred (nice-to-have) skills form a small separate bonus, capped at roughly 10 points, so they can differentiate between otherwise-equal candidates without letting peripheral overlap carry a role.

### title_family_fit

The component that stops a data analyst from being offered a backend engineering role on the strength of SQL and Git. Compare the candidate's title history against the job title using either taxonomy families (if using ESCO or your own) or embedding similarity between normalized titles. Take the best match across the candidate's recent titles, mildly discounting older ones.

### domain_fit

Industry overlap — banking, education, FMCG, NGO. Partial credit for adjacent domains. This is where genuinely transferable experience gets recognized, so do not weight it to zero even though it is fuzzier than skills.

### seniority_fit

Map both sides to a level (1 intern → 7 executive). Score on the signed delta, penalizing both directions:

```
delta = job_level - candidate_level
delta ==  0        → 1.0
|delta| == 1       → 0.75
delta == -2        → 0.35   (over-leveled: real mismatch)
delta <= -3        → 0.15
delta >= +2        → 0.30   (under-leveled)
```

Over-leveling being a penalty is the fix for an assistant role topping a senior professional's list.

### location_fit

Full credit when the listing explicitly permits hiring in the destination country. Partial when it says "remote" without geographic detail. Low when it names a region excluding the destination. **Never infer eligibility from the word "remote" alone** — most remote listings are region-restricted, and telling a relocating user a role is open to them when it is not is the most consequential error this product can make.

## Ranking beyond the score

Score alone produces monotonous lists — the earlier session returned three near-identical postings from one employer. Apply after scoring:

- Cap results per employer (two or three).
- Cap results per role family so the list spans options.
- Break near-ties on posting recency and salary transparency.

## Rationale generation

Build the displayed reason from the top two or three recorded contributions, naming the actual terms.

Good: "Power BI and DAX are both core requirements here and both appear throughout your recent work; the role sits in the same analytics family as your last two positions."

Bad: "Your 10 years of overall professional experience aligns with this role's seniority level." — constant across cards, names nothing specific, and in an over-leveled case it is actively misleading.

**When a cap fired, say so.** "Strong analytics overlap, but this role's core requirement is Java, which isn't in your profile" is more useful than a bare number and builds trust in the numbers that aren't capped.

## Anti-patterns

- Coverage ratio as the score.
- Equal weights across all skills.
- Any component that only ever adds.
- Recomputing the score in the presentation layer.
- Displaying a precise percentage derived from a fallback guess without any signal of uncertainty.
