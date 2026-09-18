// Occupation/role-family compatibility — a small, deterministic gate
// applied before recommendationService.ts's existing skill/experience
// score, so a candidate's raw skill overlap can no longer make a clearly
// unrelated job (e.g. a Marine Biologist matching a Data Analyst posting
// purely on Python/SQL) rank as if it were a genuinely good fit.
//
// Replaces the previous hand-curated DOMAIN_FAMILIES keyword system with
// ESCO/ISCO-based classification: the candidate's stated role and the
// job's title/description are each resolved to a real ESCO occupation
// (escoTaxonomyClient.ts), and role-family relation is read directly off
// their ISCO-08 group codes — same 3-digit minor group (e.g. 2511/2512,
// both "software and applications developers and analysts") counts as the
// SAME family; same 2-digit sub-major group, or one of the small curated
// cross-sub-major bridges below, counts as ADJACENT; anything else is
// UNRELATED. This replaces ~20 hand-picked keyword lists with a real
// occupational taxonomy of ~2,330 occupations, closing the exact class of
// gap that produced the confirmed root-cause bug: a Power BI/SQL/finance
// resume's top match was "Senior SAP AMS Consultant (SAP EWM)" purely
// because the OLD keyword taxonomy had no ERP/SAP-consulting concept at
// all to classify that job against.
//
// Categories (unchanged in spirit from the previous system):
//   - same_family: candidate's occupation and the job's occupation share an
//     ISCO minor group — no adjustment, existing score stands.
//   - adjacent:    a genuine, ISCO-adjacent role family — a moderate
//     discount, not a rejection.
//   - unrelated:   confirmed different family — a sharp discount plus a
//     hard cap, so even a very high raw skill-overlap score can't slip
//     through as misleadingly "good."
//   - unknown:     either side's occupation couldn't be resolved from ESCO
//     at all (see resolveEscoOccupation's own honesty guarantee — ESCO has
//     real coverage gaps too, e.g. no dedicated "SAP consultant" occupation
//     exists even in the full, untrimmed ESCO taxonomy). An unresolved
//     CANDIDATE is a true no-adjustment pass-through (multiplier 1) — we
//     have nothing to judge them by. An unresolved JOB gets a real (but
//     uncapped) discount instead — see WEAK_EVIDENCE_MULTIPLIER — the same
//     asymmetry the old system used, for the same reason: an unclassifiable
//     candidate is never penalized for a taxonomy gap, but an
//     unclassifiable job must not silently earn the same confidence as a
//     confirmed same-family match.

import type { Skill } from '../types';
import { resolveEscoOccupation, type ResolvedOccupation } from './escoTaxonomyClient';
import { deriveJobQuery } from './jobQueryService';

export type OccupationCompatibilityCategory = 'same_domain' | 'adjacent' | 'unrelated' | 'unknown';

export interface OccupationCompatibilityResult {
  category: OccupationCompatibilityCategory;
  // Applied multiplicatively to the existing skill/experience/industry/
  // transferable score in recommendationService.ts — never an additive
  // term. 1 for same_domain and candidate-unresolved unknown.
  multiplier: number;
  // Present only for 'unrelated' — an absolute ceiling applied after the
  // multiplier, so a very high raw score still can't read as "good."
  cap?: number;
  reason:
    | 'same_family'
    | 'adjacent_isco_group'
    | 'different_family'
    | 'candidate_occupation_unresolved'
    | 'job_occupation_unresolved';
  // The resolved ESCO occupation on each side, when available — exposed so
  // recommendationService.ts can source skill gaps from the JOB occupation's
  // own essential skills (never from free-text keywords) without having to
  // re-resolve it a second time.
  candidateOccupation: ResolvedOccupation | null;
  jobOccupation: ResolvedOccupation | null;
}

const SAME_FAMILY_MULTIPLIER = 1;
const ADJACENT_MULTIPLIER = 0.85;
const UNRELATED_MULTIPLIER = 0.25;
const UNRELATED_CAP = 30;
// Same role as the old system's WEAK_EVIDENCE_MULTIPLIER — applied only
// when the CANDIDATE resolved but the JOB's title/description matched no
// ESCO occupation at all. Genuine missing evidence, not a confirmed
// mismatch, so it gets a real discount but no hard cap.
const WEAK_EVIDENCE_MULTIPLIER = 0.6;

// Curated cross-boundary ISCO bridges for specific, confirmed-real adjacent
// role-family pairs — the direct ISCO equivalent of the old system's
// ADJACENT_DOMAIN_PAIRS, just keyed on ISCO codes instead of hand-named
// domains. Deliberately kept at MINOR-GROUP (3-digit) granularity, not a
// blanket 2-digit sub-major bridge: an earlier version of this table used
// ['25','24'] (all of "ICT professionals" <-> all of "Business & admin
// professionals") to bridge "data analyst" (2511) with "business analyst"/
// "business intelligence manager" (2421) — genuinely adjacent — but that
// same blanket rule also silently made "Financial Analyst" (2413) adjacent
// to "Web Developer" (2513), which are not, since both pairs happen to
// cross the same 25/24 boundary. Confirmed via test regression — a Banker
// candidate was wrongly scored 'adjacent' against an unrelated Web
// Developer gig. Narrowing to the specific minor-group pair that's actually
// justified (251 "software/applications developers and analysts" <-> 242
// "administration professionals", which is what "data analyst" and
// "business analyst"/"business intelligence manager" both fall under)
// fixes that collision without losing the case this bridge exists for.
const ADJACENT_MINOR_GROUP_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['251', '242'], // Software/applications developers & analysts <-> Administration professionals (data analyst <-> business analyst / BI manager)
];

function subMajorGroup(iscoGroup: string): string {
  return iscoGroup.slice(0, 2);
}
function minorGroup(iscoGroup: string): string {
  return iscoGroup.slice(0, 3);
}

// Same 2-digit ISCO sub-major group (e.g. both under 23 "Teaching
// professionals") is treated as adjacent WITHOUT needing a curated pair —
// unlike the cross-sub-major case above, staying within one sub-major is a
// low-risk generalization (confirmed via "secondary school teacher" (2330)
// <-> "instructional designer" (2359), a genuine transition ISCO itself
// already groups together) — the risky case was specifically bridging
// ACROSS two different sub-majors, which is why that part is curated and
// narrow instead.
function familyRelation(iscoA: string, iscoB: string): 'same' | 'adjacent' | 'unrelated' {
  const minorA = minorGroup(iscoA);
  const minorB = minorGroup(iscoB);
  if (minorA === minorB) return 'same';
  if (subMajorGroup(iscoA) === subMajorGroup(iscoB)) return 'adjacent';
  if (ADJACENT_MINOR_GROUP_PAIRS.some(([x, y]) => (x === minorA && y === minorB) || (x === minorB && y === minorA))) {
    return 'adjacent';
  }
  return 'unrelated';
}

/**
 * Resolves the candidate's own ESCO occupation, in priority order:
 * 1. `likelyRole` text directly, when it resolves to a real ESCO occupation
 *    — the strongest, most explicit signal.
 * 2. The query term deriveJobQuery() would search for (jobQueryService.ts)
 *    — reuses its own dominant-skill-cluster resolution (e.g. "Senior Data
 *    Analyst" for a Python/SQL/Power-BI-heavy profile) rather than
 *    duplicating that logic, so occupation resolution can never disagree
 *    with what the app actually searches job boards for.
 * Returns null when neither resolves — a genuinely unrecognized or absent
 * occupation is never guessed at.
 */
export function resolveCandidateOccupation(
  likelyRole: string | undefined,
  skills: Skill[] | undefined,
  industries: string[] | undefined
): ResolvedOccupation | null {
  if (likelyRole?.trim()) {
    const direct = resolveEscoOccupation(likelyRole);
    if (direct) return direct;
  }

  const query = deriveJobQuery({
    skills: skills ?? [],
    experience: '',
    yearsExperience: 0,
    industries: industries ?? [],
    likelyRole: undefined, // already tried above; force the skill-cluster/industry path here
  });
  if (query.source === 'seniority_fallback') return null; // no real signal to resolve from
  return resolveEscoOccupation(query.primaryQuery);
}

function resolveJobOccupation(jobTitle: string, jobDescription: string | undefined): ResolvedOccupation | null {
  return resolveEscoOccupation(jobTitle) ?? (jobDescription ? resolveEscoOccupation(jobDescription) : null);
}

/**
 * The main entry point — see the module comment above for the full
 * category/multiplier design. Never throws; always returns a usable
 * result, including when neither side resolves to a known ESCO occupation
 * at all ('unknown', no adjustment).
 *
 * Signature intentionally unchanged from the previous keyword-based
 * implementation (same 5 positional args, same order) so
 * recommendationService.ts's and matchingService.ts's call sites needed no
 * changes beyond this file.
 */
export function classifyOccupationCompatibility(
  candidateLikelyRole: string | undefined,
  candidateIndustries: string[] | undefined,
  jobTitle: string,
  jobDescription: string | undefined,
  candidateSkills?: Skill[]
): OccupationCompatibilityResult {
  const candidateOccupation = resolveCandidateOccupation(candidateLikelyRole, candidateSkills, candidateIndustries);
  if (!candidateOccupation) {
    return {
      category: 'unknown',
      multiplier: 1,
      reason: 'candidate_occupation_unresolved',
      candidateOccupation: null,
      jobOccupation: null,
    };
  }

  const jobOccupation = resolveJobOccupation(jobTitle, jobDescription);
  if (!jobOccupation) {
    return {
      category: 'unknown',
      multiplier: WEAK_EVIDENCE_MULTIPLIER,
      reason: 'job_occupation_unresolved',
      candidateOccupation,
      jobOccupation: null,
    };
  }

  const relation = familyRelation(candidateOccupation.iscoGroup, jobOccupation.iscoGroup);

  if (relation === 'same') {
    return { category: 'same_domain', multiplier: SAME_FAMILY_MULTIPLIER, reason: 'same_family', candidateOccupation, jobOccupation };
  }
  if (relation === 'adjacent') {
    return { category: 'adjacent', multiplier: ADJACENT_MULTIPLIER, reason: 'adjacent_isco_group', candidateOccupation, jobOccupation };
  }
  return {
    category: 'unrelated',
    multiplier: UNRELATED_MULTIPLIER,
    cap: UNRELATED_CAP,
    reason: 'different_family',
    candidateOccupation,
    jobOccupation,
  };
}
