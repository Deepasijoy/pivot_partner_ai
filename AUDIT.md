# PivotPartner — Job Matching & Recommendation Engine Audit

Read-only investigation. No source files were modified. All line numbers verified against the working tree on branch `multi-provider-jobs` on 2026-09-03.

`.claude/skills/job-match-scoring/SKILL.md` — **NOT FOUND**. There is no committed target-architecture document to measure the code against, so this report evaluates the code on its own terms (internal consistency, honesty about what's real vs. mock, and correctness of the stated design intent in its own comments).

---

## 1. Pipeline map

| Stage | File | Function | Status |
|---|---|---|---|
| Resume upload | `src/services/resumeParserService.ts` | `parseResume()` (15–37) | present |
| PDF → text | `src/services/resumeParserService.ts` | `extractPdfText()` / `assembleReadableText()` (44–128) | present |
| Skill extraction | `src/services/skillExtractionService.ts` | `detectSkills()` (294–350) | present, **buggy** — see Q3/Q5 |
| Years/seniority/role extraction | `src/services/resumeParserService.ts` | `detectYearsExperience()` (134–137), `detectSeniority()` (191–201), `detectLikelyRole()` (171–189) | present |
| Industry detection | `src/services/industryDetectionService.ts` | `detectIndustries()` (135–144) | present |
| Job fetch (query derivation) | `src/services/jobQueryService.ts` | `deriveJobQuery()` (144–210) | present |
| Job fetch (live aggregation) | `src/services/jobAggregatorService.ts` | `searchJobs()` (227–320) | present |
| Job fetch (dead path, do not confuse with the above) | `src/services/jobService.ts` | `loadJobOpportunities()` (123–161), `fetchLiveJobs()` (174–177) | **DEAD CODE** — see Q21 |
| Match scoring — pipeline #1 (Career Paths / Skill Gaps / Overall market fit) | `src/services/matchingService.ts` + `src/services/skillAnalysisService.ts` | `matchJobsForUser()` (16–35), `calculateMatchScore()` (36–46) | present, **diverges from pipeline #2** — see Q13 |
| Match scoring — pipeline #2 (Recommended Paths cards) | `src/services/recommendationService.ts` | `scoreJob()` (78–149) | present, **diverges from pipeline #1** — see Q13 |
| Occupation/domain gate (shared by both pipelines) | `src/services/occupationMatchingService.ts` | `classifyOccupationCompatibility()` (310–360) | present |
| Ranking | `src/services/matchingService.ts` / `recommendationService.ts` | `.sort((a,b) => b.matchScore - a.matchScore)` inline (matchingService.ts:33, recommendationService.ts:244) | present — no distinct "ranking" module, it's an inline sort at the end of each scorer |
| Career paths | `src/services/matchingService.ts` | `generateCareerPaths()` (206–229) | present |
| Skill gaps | `src/services/skillAnalysisService.ts` | `calculateSkillGaps()` (12–34) | present |
| Course recommendations | `src/services/skillAnalysisService.ts` | `recommendCourses()` (48–68) | present, **always reads a 21-item hardcoded array**, no API — see Q17, Q21 |
| AI rationale/chat context | `src/services/aiContextService.ts` | `buildAiContext()` (46–142) | present |
| UI render — Career Paths / Skill Gaps / Overall fit | `src/components/SkillAnalysis.tsx` | lines 68–88, 170–260 | present |
| UI render — Recommended Paths cards | `src/components/CareerRecommendations.tsx` | lines 108–152, 262–264 | present |

**Gaps marked MISSING**, per the pipeline the task asked me to trace:
- **A single, canonical scoring stage — MISSING.** There are two independently-implemented scorers (`calculateMatchScore` and `scoreJob`) that both run, both get shown to the user, and never agree. See Q6/Q13.
- **A required-vs-nice-to-have skill split on live job data — MISSING.** `JobOpportunity` (src/types/index.ts:96–130) has no field for it. See Q9.
- **Skill importance/rarity weighting — MISSING.** See Q8.
- **A distinct "ranking" module — MISSING** (it's an inline `.sort` at the tail of each scorer, not a separate stage).
- **A resume fixture/sample resume committed to the repo — MISSING.** No file matching a real resume exists in the repo; Q5's raw output below was produced by running the extractor on synthetic text I authored to match the task's own required test lines.

---

## 2. Answers to the 22 questions

### SKILL EXTRACTION

**Q1. Where does resume text become a list of skills? Paste the actual parsing code.**

`src/services/skillExtractionService.ts:294–350`, `detectSkills()`:

```ts
export function detectSkills(text: string): Skill[] {
  const lowerText = text.toLowerCase();
  const allSkills = [...mockSkillTaxonomy.technical, ...mockSkillTaxonomy.business];
  const matched: Skill[] = [];
  const seen = new Set<string>();

  for (const skill of allSkills) {
    if (containsTerm(lowerText, skill.name)) {
      seen.add(skill.name.toLowerCase());
      matched.push(skill);
    }
  }

  for (const [alias, canonicalName] of Object.entries(SKILL_ALIASES)) {
    if (seen.has(canonicalName.toLowerCase())) continue;
    if (!containsTerm(lowerText, alias)) continue;

    const skill = allSkills.find((candidate) => candidate.name === canonicalName);
    if (skill) {
      seen.add(skill.name.toLowerCase());
      matched.push(skill);
    }
  }

  for (const skill of allSkills) {
    if (seen.has(skill.name.toLowerCase())) continue;
    const tokens = significantTokens(skill.name);
    if (fuzzyMatchesNearby(lowerText, tokens)) {
      seen.add(skill.name.toLowerCase());
      matched.push(skill);
    }
  }

  for (const phrase of extractListedSkillPhrases(text)) {
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;

    const canonicalName = allSkills.find((skill) => skill.name.toLowerCase() === key)?.name ?? SKILL_ALIASES[key];
    const canonical = canonicalName ? allSkills.find((skill) => skill.name === canonicalName) : undefined;
    if (canonical) {
      if (seen.has(canonical.name.toLowerCase())) continue;
      seen.add(canonical.name.toLowerCase());
      matched.push(canonical);
      continue;
    }

    seen.add(key);
    matched.push(buildUnknownSkill(phrase));
  }

  return matched;
}
```

Called from `resumeParserService.ts:23` (`const skills = detectSkills(text);`) and reused for job-description text by `jobAggregatorService.ts:206` and `jobService.ts:42/38` (re-exported).

**Q2. Is there a canonical skill list/taxonomy anywhere, or are raw strings compared directly?**

There is a canonical taxonomy — but it is a small, fully hardcoded list, not any external/industry taxonomy. `src/services/mockData.ts:58–110`:

```ts
export const mockSkillTaxonomy: { technical: Skill[]; business: Skill[] } = {
  technical: [ skillJavaScript, skillTypeScript, skillPython, skillReact, skillNodeJS, skillSQL,
    skillAWS, skillDocker, skillKubernetes, skillMachineLearning, skillTensorFlow, skillDataAnalysis,
    skillPowerBI, skillTableau, skillFigma, skillUIUXDesign, skillDevOps, skillCICD, skillGit,
    skillRESTAPIs, skillCloudArchitecture, skillSystemDesign, ], // 22 entries
  business: [ skillFinancialModeling, skillFinancialAnalysis, skillExcel, skillMarketResearch,
    skillBusinessStrategy, skillProjectManagement, skillAgileScrum, skillStakeholderManagement,
    skillSalesStrategy, skillMarketingStrategy, skillContentWriting, skillSEO, skillCustomerSuccess,
    skillHRManagement, skillRecruitment, skillOperationsManagement, skillProcessOptimization,
    skillBudgeting, skillForecasting, skillNegotiation, skillPublicSpeaking, skillGrantWriting,
    skillBusinessDevelopment, skillCRM, skillDataDrivenDecisionMaking, ], // 24 entries
};
```

46 skills total, hand-written in `mockData.ts:8–56` as individual `const skillX: Skill = {...}` declarations. Nothing is compared as raw uncanonicalized strings — every match is resolved against this list (directly, via `SKILL_ALIASES`, or via fuzzy nearby-token matching) — **except** the `extractListedSkillPhrases()` fallback path (Q1's 4th loop), which explicitly preserves a phrase verbatim as an "unknown"/`general`-category skill when it matches neither the taxonomy nor an alias. So the system is taxonomy-first, with an escape hatch for anything the taxonomy doesn't recognize.

**Q3. What delimiters does it split on? Show how "Databases: SQL, MySQL" and "Python (Pandas, Scikit-learn)" are handled.**

`src/services/skillExtractionService.ts:63–69`, `splitIntoPhrases()`:

```ts
function splitIntoPhrases(chunk: string): string[] {
  return chunk
    .split(/[,;•·|\n]|(?:^|\s)-\s/)
    .map((phrase) => phrase.replace(/^[\s\-•·*]+|[\s.,:;]+$/g, '').trim())
    .filter((phrase) => phrase.length >= MIN_PHRASE_LENGTH && phrase.length <= MAX_PHRASE_LENGTH)
    .filter((phrase) => !/^\d+$/.test(phrase));
}
```

The split regex is `[,;•·|\n]` (comma, semicolon, bullet, middle-dot, pipe, newline) or a spaced hyphen. **It does not split on `:` or on `(`/`)`.** This is a real, confirmed bug — demonstrated with the task's own two example lines. Live extractor output (full run in Section 3):

- `"Databases: SQL, MySQL"` → the line is split only on the comma, giving `"Databases: SQL"` and `"MySQL"`. The colon is never treated as a delimiter, so the label word "Databases" stays glued to "SQL" as one malformed phrase.
- `"Python (Pandas, Scikit-learn)"` → split only on the comma, giving `"Python (Pandas"` and `"Scikit-learn)"` — both with a dangling unmatched parenthesis baked into the skill name.

Root cause of why these become visible in the final output rather than being silently discarded: in `detectSkills()` (Q1, 4th loop), the mangled phrase's lowercase key (`"databases: sql"`) is looked up in `SKILL_ALIASES` (line 336: `SKILL_ALIASES[key]`). `SKILL_ALIASES` does have an entry `databases: 'SQL'` (line 173) — but the alias key is the single word `"databases"`, not `"databases: sql"` with the colon and second word still attached, so the lookup misses. The phrase falls through to `buildUnknownSkill(phrase)` (line 346) and is preserved as-written, byte-for-byte, in the skill list shown to the user — sitting right next to the correctly-detected, clean `"SQL"` entry that the taxonomy pass (Q1's 1st loop) separately found elsewhere in the resume text. See raw output in Section 3.

**Q4. Is there any deduplication? Case normalization?**

Yes, both — but only within `detectSkills()`'s own `seen` set, keyed on lowercase canonical skill name (e.g. `seen.add(skill.name.toLowerCase())`, lines 302/313/322/340/345). This correctly prevents `"SQL"` from appearing twice as a clean taxonomy entry. It does **not** dedupe across the taxonomy/alias pathway and the "preserve verbatim as unknown" pathway when the same real-world skill produces two differently-shaped strings — which is exactly what happened above: `"SQL"` (clean, from taxonomy match) and `"Databases: SQL"` (mangled, from the unknown-phrase fallback) both survive in the final array as two separate entries for what is, to a human reader, the same skill. `extractListedSkillPhrases()` itself does its own separate case-insensitive dedup within its own output (lines 95–102, keyed on `phrase.toLowerCase()`), but that only prevents *identical* mangled phrases from repeating — it does nothing to reconcile a mangled phrase against its own clean canonical form.

**Q5. Run the extractor on any test resume in the repo and paste the raw output array verbatim.**

No resume fixture exists in the repo (confirmed — no file under the repo matches a resume other than source `.ts` files). I ran the real, unmodified `detectSkills()` from `src/services/skillExtractionService.ts` against synthetic resume text that includes the task's own two required lines verbatim, via `node --import "./test/setup/register-ts-loader.mjs"` against the actual project file (not a copy, not a mock). Full, unedited output in Section 3.

### SCORING

**Q6. Paste the complete scoring function(s). If there is more than one place a match percentage is computed, list every one.**

There are **two** independent match-percentage computations, plus a **third**, structurally-unused one:

1. `src/services/skillAnalysisService.ts:36–46`, `calculateMatchScore()` — feeds pipeline #1 (`matchingService.ts`):

```ts
export function calculateMatchScore(userSkills: Skill[], requiredSkills: Skill[], niceToHave: Skill[] = []): number {
  const userSkillNames = new Set(userSkills.map((skill) => skill.name.toLowerCase()));

  const countRequired = requiredSkills.filter((skill) => userSkillNames.has(skill.name.toLowerCase())).length;
  const requiredPoints = requiredSkills.length > 0 ? (countRequired / requiredSkills.length) * 70 : 0;

  const countNice = niceToHave.filter((skill) => userSkillNames.has(skill.name.toLowerCase())).length;
  const nicePoints = niceToHave.length > 0 ? (countNice / niceToHave.length) * 30 : 0;

  return Math.round(requiredPoints + nicePoints);
}
```

2. `src/services/recommendationService.ts:78–149`, `scoreJob()` — feeds pipeline #2 (`recommendationService.ts`/`CareerRecommendations.tsx`):

```ts
function scoreJob(profile: ResumeProfile, job: JobOpportunity): JobScore {
  const matchedSkills = job.requiredSkills.filter((skill) => hasSkillByName(profile.skills, skill.name));
  const missingSkills = job.requiredSkills.filter((skill) => !hasSkillByName(profile.skills, skill.name));
  const skillMatchPercent = job.requiredSkills.length > 0 ? (matchedSkills.length / job.requiredSkills.length) * 100 : 0;

  const [idealMin, idealMax] = seniorityRangeForTitle(job.title);
  let experienceScore: number;
  if (profile.yearsExperience >= idealMin && profile.yearsExperience <= idealMax) {
    experienceScore = 100;
  } else {
    const distance =
      profile.yearsExperience < idealMin ? idealMin - profile.yearsExperience : profile.yearsExperience - idealMax;
    experienceScore = Math.max(0, 100 - distance * 15);
  }

  const industry = COMPANY_INDUSTRY[job.company] ?? 'General Business';
  const userIndustriesLower = profile.industries.map((i) => i.toLowerCase());
  let industryScore: number;
  if (userIndustriesLower.includes(industry.toLowerCase())) {
    industryScore = 100;
  } else if (userIndustriesLower.length === 0 || userIndustriesLower.includes('general business')) {
    industryScore = 50;
  } else {
    industryScore = 20;
  }

  const businessRequired = job.requiredSkills.filter((skill) => skill.category === 'business');
  const matchedBusinessSkills = businessRequired.filter((skill) => hasSkillByName(profile.skills, skill.name));
  const transferableScore =
    businessRequired.length === 0 ? 50 : (matchedBusinessSkills.length / businessRequired.length) * 100;

  const rawScore = Math.round(
    skillMatchPercent * WEIGHT_SKILL_MATCH +
      experienceScore * WEIGHT_EXPERIENCE +
      industryScore * WEIGHT_INDUSTRY +
      transferableScore * WEIGHT_TRANSFERABLE
  );

  const occupationCompatibility = classifyOccupationCompatibility(
    profile.likelyRole, profile.industries, job.title, job.description
  );
  let matchScore = Math.round(rawScore * occupationCompatibility.multiplier);
  if (occupationCompatibility.cap !== undefined) {
    matchScore = Math.min(matchScore, occupationCompatibility.cap);
  }
  matchScore = Math.max(0, Math.min(100, matchScore));

  return { matchScore, skillMatchPercent, experienceScore, industryScore, transferableScore, industry,
    matchedSkills, missingSkills, matchedBusinessSkills, occupationCompatibility };
}
```

Weights, `recommendationService.ts:9–12`: `WEIGHT_SKILL_MATCH = 0.5`, `WEIGHT_EXPERIENCE = 0.2`, `WEIGHT_INDUSTRY = 0.15`, `WEIGHT_TRANSFERABLE = 0.15`.

3. `mockRemoteJobs`/`mockFreelanceGigs` in `mockData.ts` each carry a hardcoded `matchScore`/`matchPercentage` field (e.g. `mockData.ts:123`, `job_001.matchScore: 92`) — **structurally unused**: every real caller overwrites it. See Q6 continuation in Q21.

Both real scorers (#1 and #2) are then independently multiplied by the same `classifyOccupationCompatibility()` gate (Q12) before being clamped to `[0,100]`.

**Q7. Is the score a coverage ratio (matched/total listed)? Is every skill weighted equally?**

Pipeline #1 (`calculateMatchScore`) — yes, a pure coverage ratio: `(matched/total)*70` for required, `(matched/total)*30` for nice-to-have (dead in practice, see Q9). Every skill within a bucket counts identically — no per-skill weight.

Pipeline #2 (`scoreJob`) — `skillMatchPercent` is also a flat coverage ratio (`matchedSkills.length / job.requiredSkills.length * 100`, line 81), then blended with experience/industry/transferable sub-scores at fixed weights. Within the skill-match component itself, every required skill again counts identically — no per-skill weight.

**Q8. Is there ANY use of skill rarity, IDF, or weighting by importance?**

**NOT FOUND.** Neither scorer weights a skill by rarity, demand, or importance when computing the match percentage itself. The only place `demandLevel` (`'very_high' | 'high' | 'medium'`) is used at all is downstream, in `calculateSkillGaps()` (Q16) for a *time-to-learn* estimate, and in `recommendationService.ts`'s `buildRecommendedAction()` (lines 179–184) for a `weightedGap` heuristic that decides the wording of a recommended-action string — never in the match score itself.

**Q9. How is a job's required vs. optional/nice-to-have skill list determined? Or is it one flat list?**

It is a flat list in practice, and the data model doesn't even support anything else for a real job. `JobOpportunity` (`src/types/index.ts:96–130`) has exactly one skill field for requirements: `requiredSkills: Skill[]`. There is no `niceToHaveSkills`, `optionalSkills`, or equivalent field anywhere on `JobOpportunity`. `calculateMatchScore()`'s `niceToHave` parameter (Q6) does exist in the function signature — but grep confirms every call site passes `[]`:

- `matchingService.ts:19`: `calculateMatchScore(profile.skills, job.requiredSkills, [])`
- `matchingService.ts:55`: `calculateMatchScore(userSkills, gig.requiredSkills, [])`

So the 30-point "nice to have" bucket of `calculateMatchScore` is live code that is structurally dead: it can never receive a non-empty array from any caller in this codebase, because nothing upstream of it — not the job type, not any provider adapter, not the taxonomy — ever produces a required/optional split to pass in.

**Q10. Is seniority used? Is over-qualification penalized, ignored, or treated as a positive?**

Yes, in pipeline #2 only. `recommendationService.ts:39–44`, `seniorityRangeForTitle()`:

```ts
function seniorityRangeForTitle(title: string): [number, number] {
  const lowerTitle = title.toLowerCase();
  if (/(senior|lead|principal|director|head)/.test(lowerTitle)) return [6, 15];
  if (/manager/.test(lowerTitle)) return [4, 12];
  return [1, 8];
}
```

This derives an "ideal experience range" purely from a regex over the **job title text**, not from the candidate's own detected seniority label (`ResumeProfile.seniority`, set by `resumeParserService.ts`'s `detectSeniority()`, which is never read here). Both under- and over-qualification are penalized identically and symmetrically: `experienceScore = Math.max(0, 100 - distance * 15)` (line 90) applies the same linear penalty per year outside the range regardless of direction — over-qualification is not ignored and not treated as a positive, it is penalized exactly as hard as under-qualification. Pipeline #1 (`calculateMatchScore`) does not use seniority/experience at all — it is purely skill-coverage.

**Q11. Is job title or role family compared at all, or is it purely skill overlap?**

Yes — both pipelines gate their skill-based score through `occupationMatchingService.ts`'s `classifyOccupationCompatibility()` (Q12), which does compare job title/description against the candidate's `likelyRole`/`industries` via a curated domain-family keyword list (`DOMAIN_FAMILIES`, 97–183). So it is not purely skill overlap — but the *base* skill-match score itself (before the gate) is purely skill overlap in both pipelines; the title/role comparison is applied afterward as a multiplier, never as an input to the coverage ratio itself.

**Q12. Are there any hard filters/gates (language, location, level)? List them.**

- **Occupation/domain gate** (both pipelines) — `occupationMatchingService.ts:310–360`. Not a hard filter that removes a job outright; it's a multiplier (`same_domain`×1, `adjacent`×0.85, `unrelated`×0.25 **with a hard cap of 30**, `unknown`×1 or ×0.6 depending on which side is unresolvable). The `unrelated` case's cap (`UNRELATED_CAP = 30`, line 72) is the closest thing to a hard filter — it can't be scored above 30% no matter the raw skill overlap.
- **Geographic gate** (job-fetch stage, not scoring) — `jobAggregatorService.ts:147–189`, `filterByDestination()`. For local/hybrid, a job is dropped entirely if its location text doesn't match the destination city/region. For remote, a job is dropped if `classifyRemoteEligibility()` returns `'incompatible'` (an explicit different country/region named).
- **No language or "level" (seniority) hard filter exists anywhere** — seniority only ever affects `scoreJob()`'s `experienceScore` sub-component (Q10), never excludes a job outright.

### CONSISTENCY

**Q13. The job list and the career-paths panel show different percentages for the same role. Find both code paths and explain exactly why they diverge.**

Confirmed, with exact call sites. Two genuinely separate, never-reconciled pipelines feed two different UI panels:

- **`SkillAnalysis.tsx`'s "Overall market fit" banner and "Career Paths" grid** — `src/components/SkillAnalysis.tsx:68–80`:
```ts
useEffect(() => {
  const matchedJobs = matchJobsForUser(profile, jobsForCareerGuidance(jobs));
  const paths = generateCareerPaths(profile.skills, matchedJobs, profile.likelyRole, profile.industries);
  ...
  const topJob = matchedJobs[0];
  const overallMatchScore = paths[0]?.matchPercentage ?? topJob?.matchScore ?? 0;
  ...
}, [profile, jobs]);
```
  This calls `matchJobsForUser()` (pipeline #1, `matchingService.ts:16–35`), which calls `calculateMatchScore()` (Q6, formula #1).

- **`CareerRecommendations.tsx`'s "Recommended Paths" cards** — `src/components/CareerRecommendations.tsx:108–144`:
```ts
const remoteRecs = workModels.includes('remote')
  ? getCareerRecommendations(profile, { jobs: jobsForCareerGuidance(remoteJobs) })
  : [];
const localRecs: CareerRecommendation[] = workModels.includes('local') && localJobSource === 'live' && localJobs && localJobs.length > 0
  ? getCareerRecommendations(profile, { jobs: localJobs, limit: 5 }).map((rec) => ({ ...rec, workModel: 'local' as WorkModel, title: rec.title.replace(/^Remote\s+/i, '') }))
  : [];
```
  This calls `getCareerRecommendations()` → `scoreJob()` (pipeline #2, `recommendationService.ts:78–149`, formula #2).

**Why they diverge, concretely:** formula #1 is `(matchedRequired/totalRequired)*70` (nice-to-have is always `[]`, Q9) — a single-factor coverage ratio out of 70 max (since `niceToHave.length === 0` means `nicePoints` is always `0`, so the practical ceiling before occupation-gating is 70, not 100). Formula #2 is a 4-factor weighted blend (`skillMatchPercent*0.5 + experienceScore*0.2 + industryScore*0.15 + transferableScore*0.15`) with its own independent skill-overlap calculation (line 79–81, which — unlike formula #1 — is not the same `calculateMatchScore()` function at all, it's a separate inline `matchedSkills.filter(...).length / job.requiredSkills.length`). Both are then separately multiplied by `classifyOccupationCompatibility()`, but each pipeline calls that function independently on its own (matchingService.ts:20–25 vs recommendationService.ts:125–130) — same inputs, same result per-call, but two separate calls computing two separate base scores to multiply. For the SAME job and SAME candidate, formula #1's max achievable pre-gate score is 70 (skills-only, out of the 70-point required bucket) while formula #2's includes up to 20 points of experience-fit, 15 of industry-fit, and 15 of transferable-skill-fit on top of a differently-scaled 50-point skill component — there is no mathematical reason these should ever produce the same number, and they don't. This is the direct, root cause of the reported 70/60 and 43/24 divergence: it is not a display bug, it is two different scoring engines.

**Q14. Where does the rationale text come from? Specifically find "Your X years of overall professional experience aligns with this role's seniority level." — templated/constant or generated per match?**

Templated, not LLM-generated, not a pure constant — it's a deterministic template string with one interpolated value. `recommendationService.ts:151–161`, `buildReasons()`:

```ts
function buildReasons(profile: ResumeProfile, score: JobScore): string {
  const reasons: string[] = [];

  if (score.skillMatchPercent >= 60 && score.matchedSkills.length > 0) {
    const topNames = score.matchedSkills.slice(0, 3).map((skill) => skill.name).join(', ');
    reasons.push(`Strong overlap in ${topNames}`);
  }

  if (score.experienceScore >= 70) {
    reasons.push(`Your ${profile.yearsExperience} years of overall professional experience aligns with this role's seniority level.`);
  }
  ...
```

It only appears when `score.experienceScore >= 70` (Q10's formula), and the only variable part is `profile.yearsExperience` — the sentence structure itself is fixed. Confirmed this is never touched by the LLM: `aiContextService.ts`'s `buildAiContext()` only ever *summarizes* already-computed `CareerRecommendation`/`CareerPath` objects (it reads `rec.reason`, never regenerates it) and hands the AI an explicit instruction (`aiContextService.ts:111`): `'Do not calculate or state a different match percentage than the one given.'`

### DOWNSTREAM

**Q15. How are skill gaps derived? Which job(s) do they read from?**

`skillAnalysisService.ts:12–34`, `calculateSkillGaps()`:

```ts
export function calculateSkillGaps(userSkills: Skill[], jobRequirements: Skill[]): SkillGap[] {
  const userSkillNames = new Set(userSkills.map((skill) => skill.name.toLowerCase()));
  const missingSkills = jobRequirements.filter((skill) => !userSkillNames.has(skill.name.toLowerCase()));
  return missingSkills.map((skill) => {
    let estimatedTimeWeeks: number;
    if (skill.demandLevel === 'very_high') { estimatedTimeWeeks = 4; }
    else if (skill.demandLevel === 'high') { estimatedTimeWeeks = 2; }
    else { estimatedTimeWeeks = 1; }
    return { skill, currentLevel: 0, requiredLevel: 90, estimatedTimeWeeks };
  });
}
```

Called from `matchingService.ts`'s `buildJobCareerPath()` (line 97, against `matchedJobs[0]`/`[1]` — the top 2 jobs from `matchJobsForUser()`) and `buildFreelanceCareerPath()` (line 177, against the top freelance gig). `generateCareerPaths()` (206–229) builds up to 3 `CareerPath`s (job #1, job #2, freelance #1) this way; `mergeCareerPathSkillGaps()` (238–253) then unions and dedupes their gaps for the profile-level "Skill Gaps" section. So gaps are always sourced from `matchJobsForUser()`'s (pipeline #1's) ranking — never from `getCareerRecommendations()`'s (pipeline #2's) ranking, which is a further source of the Q13 divergence: the specific jobs used to compute "your gaps" and the jobs shown with pipeline #2's percentages aren't even guaranteed to be the same jobs in the same order.

**Q16. Where do "Est. 2 weeks to close" estimates come from — a table, a formula, or an LLM call?**

A fixed 3-bucket table, shown above in Q15: `very_high → 4 weeks`, `high → 2 weeks`, anything else (including `'medium'`, the only remaining `demandLevel` value, and the `'general'`-category unknown skills from Q3's extraction bug) `→ 1 week`. No formula involving the skill's actual real-world learning curve, no LLM call. `currentLevel: 0` and `requiredLevel: 90` (lines 29–30) are likewise fixed constants for every gap, never derived from anything in the resume.

**Q17. Where do course recommendations come from? Hardcoded, API, or LLM?**

Hardcoded. `skillAnalysisService.ts:48–68`, `recommendCourses()`:

```ts
export function recommendCourses(
  gaps: SkillGap[],
  courses: CourseRecommendation[] = mockCourses
): CourseRecommendation[] {
  const recommended: CourseRecommendation[] = [];
  const seenIds = new Set<string>();
  for (const gap of gaps) {
    const skillNameLower = gap.skill.name.toLowerCase();
    const matchingCourses = courses.filter((course) => course.skillGained.toLowerCase() === skillNameLower);
    for (const course of matchingCourses) {
      if (!seenIds.has(course.id)) { seenIds.add(course.id); recommended.push(course); }
    }
  }
  return recommended.slice(0, 3);
}
```

`mockCourses` (`mockData.ts:452–621`) is a hand-written array of 21 courses with fabricated titles, platforms, prices, and durations (e.g. `{ title: 'Advanced SQL for Data Analysis', platform: 'DataCamp', durationWeeks: 4, cost: '$99', skillGained: 'SQL' }`, `mockData.ts:454–460`). The only caller, `SkillAnalysis.tsx:77` (`const courses = recommendCourses(gaps);`), never overrides the default parameter, so this is **always** the same static 21-course catalog, exact-string-matched against `SkillGap.skill.name`. See Q21/Section 5 — this is rendered with no "example"/"illustrative" label, unlike every job panel in the app.

### DATA + AI

**Q18. Which job APIs are called, from where, and with what query parameters?**

Five providers, called in parallel from `jobAggregatorService.ts:24/262` (`PROVIDERS = [adzunaProvider, arbeitnowProvider, remotiveProvider, jsearchProvider, himalayasProvider]`, `Promise.allSettled(applicable.map(p => p.search(...)))`):

| Provider | Called from | Endpoint | Query params |
|---|---|---|---|
| Adzuna | `providers/adzunaProvider.ts:106` | `${API_URL}/api/jobs` (own backend proxy → real Adzuna) | `what`, `country`, `where` (local/hybrid only, `adzunaProvider.ts:93–104`) |
| Arbeitnow | `providers/arbeitnowProvider.ts:82` | `https://www.arbeitnow.com/api/job-board-api?page=1` | none besides `page` — confirmed by the file's own comment (lines 4–10) that `search`/`location`/`tags[]` don't filter server-side, so results are filtered client-side by `isRelevant()` (70–78) and `cityOrRegionMatchesLocationText()` |
| Remotive | `providers/remotiveProvider.ts:85` | `https://remotive.com/api/remote-jobs` | `search` (= `params.what`), `limit=30` |
| JSearch | `providers/jsearchProvider.ts:85` | `${API_URL}/api/jobs/jsearch` (own backend proxy → RapidAPI JSearch) | `what`, `where` (non-remote), `country`, `remoteOnly=true` (remote only) |
| Himalayas | `providers/himalayasProvider.ts:157` | `${API_URL}/api/jobs/himalayas` (own backend proxy → Himalayas) | `page=1`, `q` (= `params.what`, if present), `country` |

**Q19. Is there deduplication across sources?**

Yes. `jobAggregatorService.ts:113–131`, `deduplicateJobs()` — two passes: exact `applicationUrl` match first, then a normalized `fingerprint()` (title+company+location for local/hybrid; title+company+description for remote, when a description ≥20 chars is available — `fingerprint()`, lines 88–101). Applied once, across the flattened results of all five providers together (`jobAggregatorService.ts:283–285`: `const allJobs = providerResults.flatMap(...); const geoFiltered = filterByDestination(allJobs, ...); const deduped = deduplicateJobs(geoFiltered, ...)`), so this is genuinely cross-source, not per-provider.

**Q20. Is an LLM used anywhere in scoring or rationale? If yes, paste the prompts.**

**Not in the live scoring/rationale path.** The Groq LLM (`openai/gpt-oss-20b`, `server/server.js:106`) that powers the actual running chat feature is explicitly forbidden from computing or altering a score — `server/server.js`'s `SYSTEM_PROMPT` (137–489) includes (paraphrase-free, this is the literal instruction found at lines 439–441): *"A match percentage, score, or fit rating different from the one already computed and given to you — explain the given number, never calculate your own."* `aiContextService.ts:110–117` sends the same class of instruction to the model alongside every already-computed number, as quoted in Q14.

There **is** a second, entirely separate LLM path that is not connected to the live app at all: `server/services/claudeService.ts`, using the Anthropic SDK directly (`import Anthropic from '@anthropic-ai/sdk'`) with model `claude-opus-5` (line 7). Its `RESUME_SYSTEM_PROMPT` (lines 94–106) does drive actual resume-field extraction via Claude, structured with a Zod schema:

```
You are PivotPartner AI's resume analysis engine.

Read the resume text supplied by the user and extract a structured profile:
- professionalSummary: a 1-2 sentence summary of who this person is professionally.
- likelyRole: the single job title that best matches their experience.
- seniority: one of "Entry-level", "Junior", "Mid-level", "Senior", or "Principal / Lead".
- yearsExperience: total years of professional experience as a number.
- industries: the industries this person has worked in.
- skills: concrete skills demonstrated in the resume (technical and business/soft skills).
- transferableSkills: skills from this resume that would transfer well to a different industry or role.
- careerPaths: 2-4 plausible next career paths, each with a short reason grounded in the resume content.

Only extract what is actually supported by the resume text. Do not invent employers, skills, or experience that are not present or reasonably implied by the text.
```

This is mounted at `POST /api/analyze-resume` in `server/routes/resume.ts`, but only inside `server/index.ts` (`server/index.ts:5,21`) — a **completely separate Express app** from the one the project actually runs. `package.json:9`'s only server script is `"server": "node server/server.js"`; `server/index.ts` is never started by any npm script. Grep confirms zero frontend `fetch(...)` calls to `/api/analyze-resume` anywhere in `src/` — the only reference in `src/` is a code comment in `src/types/index.ts:32` explaining why some `ResumeProfile` fields are optional. **This entire second backend — its own chat route too (`./routes/chat`, `server/index.ts:4,20`) — is dead, disconnected code that happens to also hold a real, working, differently-designed resume-parsing LLM pipeline that the live app never calls.** See Section 5/Top-10 #6.

**Q21. Is anything hardcoded, mocked, or stubbed that appears live in the UI? List every instance — this matters more than it sounds.**

- **`mockCourses` (21 hardcoded courses, `mockData.ts:452–621`)** — rendered under a plain "Recommended Courses" heading (`SkillAnalysis.tsx:170–192`) with **no "example"/"illustrative" qualifier anywhere in the render path**, unlike every job-listing panel in the app, which explicitly labels live-vs-mock jobs (`jobSource` prop, the `'EXAMPLE/SAMPLE'` text in `aiContextService.ts:76–82`). A user sees `"Advanced SQL for Data Analysis · DataCamp · 4 weeks · $99"` presented with the same visual weight as a real, currently-enrollable course. It is not: there is no course API anywhere in this codebase.
- **`mockRemoteJobs`/`mockFreelanceGigs` baked `matchScore`/`matchPercentage`/`matchedSkills`/`missingSkills` fields** (e.g. `mockData.ts:123–126`, `job_001`) — never presented as-is: every real caller (`scoreJob()`, `calculateMatchScore()`) recomputes these fresh from `requiredSkills` and silently discards the fixture's own baked values. Not user-visible as wrong data, but a maintenance trap — the fixture file's own numbers don't mean anything.
- **`jobService.ts`'s `loadJobOpportunities()`/`fetchLiveJobs()`** — dead, single-Adzuna-only code path, `@deprecated` in its own JSDoc (line 164), confirmed via grep to have zero live callers anywhere. The real live path is `jobAggregatorService.ts`'s `searchJobs()`. Not presented as live (it never runs), but sitting in the codebase as if it might be.
- **`server/index.ts` + `server/routes/resume.ts` + `server/services/claudeService.ts`** — a fully working, never-invoked Claude-powered resume analyzer and second chat backend (Q20). Not presented as live in the UI (nothing calls it) — flagged here because it is exactly the kind of thing that looks live to anyone reading the codebase who doesn't check whether it's actually mounted/started.
- `jobsForCareerGuidance()` (`jobService.ts:110–112`) substitutes `mockRemoteJobs` for Skill Gaps/Courses/Career Paths whenever live jobs are empty/unavailable — this **is** honestly distinguished in the UI via the `jobSource` prop threading (`SkillAnalysis.tsx:98`, `CareerRecommendations.tsx`'s `localJobSource === 'live'` gates), so it is not a hidden-mock case, just noted for completeness since the task asks to list every instance.

### TESTS

**Q22. Are there any tests covering matching? Any fixtures or sample resumes?**

18 frontend test files under `src/services/__tests__/` (Node's built-in `node:test`, no jsdom/React Testing Library — confirmed no component-level UI test exists anywhere in this repo) plus 3 backend files under `server/tests/`. Matching-relevant coverage, by what's actually tested:

- **Heavily tested:** the occupation/domain gate — `occupationMatchingService.test.ts` (24 tests), `matchingService.occupationMatching.test.ts` (9 tests), `recommendationService.occupationMatching.test.ts` (8 tests) — all exercise `classifyOccupationCompatibility()` directly or through both pipelines' wrappers.
- **Heavily tested:** the job aggregation/dedup/geo layer — `jobAggregatorService.deduplication.test.ts`, `.dataQuality.test.ts`, `.geoAccuracy.test.ts`, `.reliability.test.ts`, `.himalayas.test.ts`, plus `himalayasProvider.test.ts` and `remotiveProvider.relevance.test.ts`.
- **Tested:** skill extraction — `skillExtractionService.test.ts` (aliases, fuzzy matching, section-boundary handling) — but **no test in this file exercises the exact `"Databases: SQL"` / `"Python (Pandas, Scikit-learn)"` pattern this audit's Q3/Q5 demonstrates is broken.**
- **Tested:** `matchingService.ts`'s 3-state Career Path logic — `matchingService.careerPathStates.test.ts`; freelance fallback honesty — `matchingService.freelance.test.ts`.
- **NOT FOUND — no dedicated test file for:**
  - `skillAnalysisService.ts`'s `calculateMatchScore()` or `calculateSkillGaps()` or `recommendCourses()` in isolation (the base arithmetic of pipeline #1's coverage-ratio formula and the fixed weeks-table).
  - `recommendationService.ts`'s `scoreJob()` base weighted formula in isolation (only its occupation-gated behavior is tested).
  - `resumeParserService.ts` — `parseResume()`, `detectYearsExperience()`, `detectSeniority()`, `detectLikelyRole()` have zero direct unit tests (the file can't even be loaded under plain `node --test` due to its Vite-only `pdfjs-dist/build/pdf.worker.mjs?url` import — this is exactly why `skillExtractionService.ts`, `industryDetectionService.ts`, and `workModelSelection.ts` were each split out into small dependency-free modules elsewhere in this codebase's history, specifically to make small pieces of this file's logic testable in isolation; `parseResume()` itself never received the same treatment).
  - `jobQueryService.ts`'s `deriveJobQuery()`.
  - `geoMatch.ts` has no standalone test file (it's exercised indirectly via `jobAggregatorService.geoAccuracy.test.ts`).
  - `adzunaProvider.ts`/`arbeitnowProvider.ts`/`jsearchProvider.ts` have no dedicated per-provider test file (unlike `himalayasProvider.test.ts` and the relevance-only `remotiveProvider.relevance.test.ts`) — they're only exercised indirectly through `jobAggregatorService.*.test.ts`'s mocked fetches.
- **No resume fixture file exists anywhere in the repo** — every test that needs profile-shaped data constructs a small inline `ResumeProfile` object by hand in the test file itself (e.g. `matchingService.occupationMatching.test.ts`'s per-scenario literals). There is no shared "sample resume" fixture, text or PDF, committed anywhere.

Server tests (`server/tests/`) cover scope-guarding, CORS, and rate-limiting for the chat route — **none of the 3 backend test files touch matching, scoring, or resume analysis in any way.**

---

## 3. Raw extractor output on a real resume (unedited)

Synthetic resume text used (chosen to include the task's own required test lines verbatim):

```
Jordan Lee
Senior Data Analyst

Summary:
7 years of experience in data analytics and business intelligence,
specializing in dashboarding and stakeholder reporting.

Skills:
Databases: SQL, MySQL
Python (Pandas, Scikit-learn)
Power BI, Tableau
Git, spreadsheets

Experience:
Data Analyst - Acme Corp (2019-2026)
Built dashboards and used SQL/Python for financial reporting.

Education:
B.S. Statistics, State University
```

Run against the real, unmodified `src/services/skillExtractionService.ts` (`node --import "./test/setup/register-ts-loader.mjs"`, importing the actual project file directly):

```json
=== detectSkills(resumeText) raw output ===
[
  { "name": "Python", "category": "technical", "demandLevel": "very_high", "proficiency": 88 },
  { "name": "SQL", "category": "technical", "demandLevel": "very_high", "proficiency": 86 },
  { "name": "Power BI", "category": "technical", "demandLevel": "high", "proficiency": 77 },
  { "name": "Tableau", "category": "technical", "demandLevel": "high", "proficiency": 74 },
  { "name": "Git", "category": "technical", "demandLevel": "very_high", "proficiency": 90 },
  { "name": "Financial Analysis", "category": "business", "demandLevel": "high", "proficiency": 82 },
  { "name": "Excel", "category": "business", "demandLevel": "very_high", "proficiency": 88 },
  { "name": "Data Analysis", "category": "technical", "demandLevel": "very_high", "proficiency": 83 },
  { "name": "Databases: SQL", "category": "general", "demandLevel": "medium", "proficiency": 60 },
  { "name": "MySQL", "category": "general", "demandLevel": "medium", "proficiency": 60 },
  { "name": "Python (Pandas", "category": "general", "demandLevel": "medium", "proficiency": 60 },
  { "name": "Scikit-learn)", "category": "general", "demandLevel": "medium", "proficiency": 60 }
]

=== extractListedSkillPhrases(resumeText) raw output ===
[
  "Databases: SQL",
  "MySQL",
  "Python (Pandas",
  "Scikit-learn)",
  "Power BI",
  "Tableau",
  "Git",
  "spreadsheets"
]
```

This is exactly the bug described in Q3/Q4: `"SQL"` and `"Python"` are correctly detected twice over (once cleanly via the taxonomy pass from context elsewhere in the text, e.g. `"used SQL/Python for financial reporting"`), while the labeled `"Skills:"` section's own lines — the most authoritative signal a resume gives — produce four garbled, duplicate-meaning entries: `"Databases: SQL"`, `"MySQL"` (this one is actually fine, just not canonicalized to any taxonomy entry since MySQL isn't in the 46-skill taxonomy at all), `"Python (Pandas"`, `"Scikit-learn)"`. `"spreadsheets"` — which correctly matched the `SKILL_ALIASES` table (line 140: `spreadsheets: 'Excel'`) inside `Skills:` — is silently absent from `detectSkills()`'s final output because it was already captured as `"Excel"` via context elsewhere (`"seen"` dedup, Q4), which happens to be correct here but is coincidental, not by design of the phrase-preservation path.

---

## 4. Top 10 problems, ranked by user-visible impact

**1. Two independent scoring engines produce different match percentages for the same job, shown in two different panels of the same screen.** (`matchingService.ts`'s `calculateMatchScore()` vs `recommendationService.ts`'s `scoreJob()`, Q6/Q13.) Wrong behavior: a user sees, e.g., 70% for a role in "Recommended Paths" and 60% for the identical role in "Career Paths" — no display bug, the app is genuinely computing two different numbers from two different formulas for the same input. This is precisely the symptom the user reported (70/60, 43/24). **Effort: multi-day** — requires either unifying the two into one scoring function (touching both components, both services, and every test currently pinned to either formula's exact numbers) or deliberately documenting+reconciling the divergence if two panels are meant to measure different things.

**2. Skill extraction garbles the two most common real-world resume patterns: labeled lines with a colon, and parenthetical skill lists.** (`skillExtractionService.ts`'s `splitIntoPhrases()`, Q3/Q5.) Wrong behavior: a resume's own `"Skills:"` section — the single most authoritative signal in the document — produces entries like `"Databases: SQL"` and `"Scikit-learn)"` in the user-facing skill list / skill-gap calculations, sitting duplicated alongside the correctly-detected clean form. Demonstrated live, not theoretical. **Effort: hours** — extend the split-delimiter regex in `splitIntoPhrases()` (line 65) to also split on `:` and on `(`/`)`, then re-run the existing `skillExtractionService.test.ts` suite plus add a regression test for these two exact patterns.

**3. "Recommended Courses" are 21 fully fabricated course listings (fake titles, platforms, prices) rendered with no "example"/"illustrative" label.** (`mockData.ts:452–621`, `SkillAnalysis.tsx:170–192`, Q17/Q21.) Wrong behavior: unlike every job panel in this app (which carefully distinguishes live vs. mock via `jobSource`), a user sees `"Advanced SQL for Data Analysis · DataCamp · 4 weeks · $99"` with no visual or textual signal that this course does not exist and cannot be enrolled in. **Effort: hours** to add the same "Example/illustrative" labeling pattern already used for jobs; **multi-day** if the intent is instead to wire a real course-catalog API.

**4. No skill importance/rarity weighting anywhere, and the data model has no place to put a required-vs-nice-to-have split for a live job.** (Q8/Q9 — `JobOpportunity` has only `requiredSkills: Skill[]`.) Wrong behavior: matching one trivial, common skill counts exactly the same as matching one rare, critical one in both scorers — a candidate's fit is measured by raw count of overlapping taxonomy entries, not by what actually matters for the role. **Effort: multi-day** — needs a data-model change (add an optional-skills field to `JobOpportunity`, populate it from provider text) plus threading real weighting into both scorers and their tests.

**5. Skill-gap "time to close" estimates are a fixed 3-value table with no relationship to a skill's real learning curve, shown to the user as a specific number of weeks.** (`skillAnalysisService.ts:12–34`, Q16.) Wrong behavior: "Kubernetes" and "Excel" both being `'high'` demand get the identical "2 weeks" estimate despite obviously different real learning curves; `currentLevel: 0` / `requiredLevel: 90` are hardcoded for every gap regardless of the resume's own content. **Effort: hours** to relabel as a rough heuristic in the UI copy; **multi-day** for a real basis (e.g. course-duration-derived estimates).

**6. A second, fully working Claude-powered backend (resume analysis + chat) exists in the repo, is never started by any npm script, and is never called by the frontend.** (`server/index.ts`, `server/routes/resume.ts`, `server/services/claudeService.ts`, Q20/Q21.) Wrong behavior: none today (it's inert), but it is a live risk — a differently-designed, differently-prompted, credential-consuming resume-analysis pipeline sitting in the codebase that could be accidentally deployed, or that a future engineer could reasonably (and wrongly) assume is the one actually running. **Effort: hours** to delete if abandoned; **multi-day** to actually finish wiring it up if it was meant to replace the mock `resumeParserService.ts`.

**7. `jobService.ts`'s `loadJobOpportunities()`/`fetchLiveJobs()` are confirmed dead code coexisting with the real live path.** (Q21 — zero live callers, `@deprecated` in its own JSDoc.) Wrong behavior: none today (dead code doesn't run), but it's a maintenance/confusion hazard — a single-provider (Adzuna-only) implementation sitting next to the real 5-provider `jobAggregatorService.searchJobs()`, easy to mistakenly "fix" while producing zero actual effect. **Effort: hours** — delete both functions; `jobsForCareerGuidance`/`emptyResult`/`errorResult`/`detectSkills` re-export in the same file remain genuinely in use and should stay.

**8. Mock job/gig fixtures carry pre-baked match-score fields that are always silently discarded and recomputed, making the fixture data internally misleading.** (`mockData.ts`'s `mockRemoteJobs`/`mockFreelanceGigs`, Q21.) Wrong behavior: none visible to end users (recompute is correct), but `mockData.ts:123` claims `job_001`'s `matchScore: 92` — a number nothing in the live app will ever actually show, since every real caller overwrites it per-candidate. Confusing for anyone reading the fixture file expecting it to mean something. **Effort: hours** — delete the dead `matchScore`/`matchedSkills`/`missingSkills` fields from the fixtures (or add a comment marking them illustrative-only).

**9. The core arithmetic of both scoring pipelines has no direct unit test coverage — only their occupation-gating wrapper is tested.** (Q22.) Wrong behavior: none directly, but this is why problems #1 and #2 above went unnoticed — `calculateMatchScore()`, `scoreJob()`'s base weighted formula, and `resumeParserService.ts`'s pure extraction functions are each exercised only indirectly, through tests aimed at a different concern (occupation compatibility). **Effort: 1 day** — add direct test files for `calculateMatchScore`/`calculateSkillGaps`/`recommendCourses`, for `scoreJob()`'s base formula independent of the occupation gate, and for `resumeParserService.ts`'s pure helpers (`detectYearsExperience`, `detectSeniority`, `detectLikelyRole`).

**10. `seniorityRangeForTitle()` derives a candidate's "ideal experience" purely from a regex over the job title text, ignoring the candidate's own detected seniority — and this directly, silently controls whether the "Your X years... aligns..." rationale sentence appears at all.** (`recommendationService.ts:39–44`, Q10/Q14.) Wrong behavior: two jobs requiring genuinely identical seniority but titled differently (e.g. "Senior Analyst" vs. "Lead Analyst, Reporting") can produce different `experienceScore`s for the exact same candidate purely from title wording, and the presence/absence of the "aligns with this role's seniority level" reason line flips on the `>= 70` threshold with no visibility into why. **Effort: hours** — cross-check `seniorityRangeForTitle()`'s regex output against `ResumeProfile.seniority`/`detectSeniority()`'s own thresholds, or explicitly document why they're allowed to diverge.

---

## 5. Mocked or hardcoded but presented as real (summary)

| Item | File | Presented as real in UI? |
|---|---|---|
| 21-course catalog | `mockData.ts:452–621` | **Yes** — rendered with no example/illustrative label (`SkillAnalysis.tsx:170–192`). Worst offender. |
| Skill-gap time estimates (fixed 4/2/1-week table) | `skillAnalysisService.ts:17–25` | Yes, implicitly — shown as `"~N weeks to close skill gaps"` (`SkillAnalysis.tsx:47`) with no indication it's a coarse 3-bucket heuristic rather than a calculated figure. |
| 46-skill taxonomy | `mockData.ts:8–110` | Not really "presented as real" (it's infrastructure, not user-facing data) — but its smallness (46 skills) silently caps what can ever be recognized; anything outside it is either an alias hit or falls to the `'general'`-category unknown-skill fallback. |
| `mockRemoteJobs`/`mockFreelanceGigs` baked `matchScore` fields | `mockData.ts:116–411` | No — confirmed always overwritten before render. Listed because it's a misleading-source-of-truth trap, not a live-UI issue. |
| Second Claude-powered backend (`server/index.ts`) | `server/index.ts`, `server/routes/resume.ts`, `server/services/claudeService.ts` | No — confirmed never started, never called. Listed because it's exactly the kind of code that reads as live. |
| `jobService.ts`'s deprecated Adzuna-only fetch path | `jobService.ts:123–177` | No — confirmed zero callers. Listed for the same reason. |

---

## 6. Effort estimates (recap)

| # | Problem | Effort |
|---|---|---|
| 1 | Dual scoring pipelines diverge | Multi-day |
| 2 | Skill-phrase delimiter bug (`:`, parens) | Hours |
| 3 | Fabricated course catalog shown as real | Hours (label) / Multi-day (real API) |
| 4 | No skill weighting; no required/optional split | Multi-day |
| 5 | Fixed skill-gap week estimates | Hours (label) / Multi-day (real basis) |
| 6 | Orphaned Claude backend | Hours (delete) / Multi-day (finish) |
| 7 | Dead `loadJobOpportunities`/`fetchLiveJobs` | Hours |
| 8 | Misleading dead fields in mock fixtures | Hours |
| 9 | No unit tests for core scoring arithmetic | 1 day |
| 10 | Title-regex seniority heuristic drives rationale text | Hours |

---

*No source files were modified in the course of this investigation. This document (`AUDIT.md`) is the only file written.*
