# Skill extraction and normalization

Everything downstream inherits the errors made here. A malformed token cannot match a job description token, so it silently lowers every score it should have raised, and duplicates inflate denominators. Fix this stage before touching scoring weights.

## Goal

Turn free-text resume content into a set of **canonical skill IDs**, each with a confidence and a provenance (where in the resume it came from). Keep the raw string alongside the canonical ID so rationale text can quote the user's own wording.

## Output shape

```json
{
  "skills": [
    {
      "canonical_id": "power_bi",
      "display": "Power BI",
      "raw": ["Power BI", "Visualization & BI Tools: Power BI"],
      "confidence": 0.95,
      "source": "skills_section",
      "years": 6,
      "recency_years": 0
    }
  ],
  "titles": ["Deputy Manager — Credit Operations", "Vice Principal & Financial Administrator"],
  "seniority_level": 5,
  "domains": ["banking", "education", "fmcg"],
  "languages": ["en"],
  "total_years": 10
}
```

## Extraction rules

**Strip category labels before splitting.** Resume skill sections are usually `Label: item, item, item`. Split on the first colon, discard the label, then split the remainder. Without this you get skills named `Databases: SQL`, which match nothing.

**Do not split inside parentheses.** `Python (Pandas, Scikit-learn, VADER NLP)` is one parent skill plus three children — not a fragment called `Scikit-learn)`. Parse the parenthetical separately and attach the children as their own canonical skills.

**Never emit a single-word token that is a fragment of a known multi-word skill.** If `Digital` or `Marketing` or `Team` appears alone, check whether the surrounding raw text contains `Digital Marketing` or `Team Management` and prefer the longer canonical match. Longest-match-first against the taxonomy prevents most of this class of error.

**Deduplicate on canonical ID, merging provenance.** The same skill will legitimately appear in the summary, the skills block, and two job bullets. Merge into one entry, keep all raw strings, take the highest confidence.

**Confidence by source.** A skill named in a job bullet with a measurable outcome is stronger evidence than one listed in a keyword block. Suggested: explicit skills section 0.8, job-bullet with context 0.95, summary paragraph 0.7, certification 0.9.

**Capture recency.** A skill last used eight years ago is not equivalent to one used this year. Store years-since-last-use; the scorer applies decay.

## The canonical taxonomy

Maintain a versioned taxonomy file. For each entry:

```json
{
  "id": "power_bi",
  "display": "Power BI",
  "aliases": ["powerbi", "power-bi", "microsoft power bi", "pbi"],
  "parents": ["business_intelligence"],
  "related": ["dax", "power_query", "tableau"],
  "family": "data_analytics"
}
```

**Scope it deliberately.** Several hundred entries covering the target role families beats an exhaustive list you cannot maintain. Start with the families the product actually serves: data and analytics, software engineering, product, marketing, operations, finance, education, design. Expand when a real user's resume produces unmatched tokens — log those tokens, they are your backlog.

If you would rather not hand-build it, ESCO (the EU skills taxonomy) is free, multilingual and maps to occupations, which also helps the title-family comparison in scoring. Trade-off: it is large and its granularity does not always match how job postings phrase things, so expect to maintain an alias layer on top either way.

**`related` and `parents` enable partial credit.** Someone with Power BI and DAX has meaningful transferable evidence toward Tableau. Credit that at a discount rather than scoring it zero — transferable skill recognition is the product's stated value proposition, so this is a feature, not a nicety.

## Matching resume skills to job description skills

Run job descriptions through the same normalizer. Comparing raw resume strings against raw JD strings will fail on capitalization, punctuation and phrasing variance.

Order of attempts, stopping at the first hit:
1. Exact canonical ID match — full credit.
2. Alias match — full credit.
3. Parent/child relation — partial credit (suggest 0.6).
4. `related` sibling — partial credit (suggest 0.4).
5. Embedding similarity above a threshold — partial credit, and log it so you can promote frequent hits into the taxonomy as proper aliases.

## Logging for maintenance

Every extraction run should record unmatched JD tokens and unmatched resume tokens. Review that log periodically — it tells you precisely where the taxonomy is thin, which is far more useful than guessing at additions.
