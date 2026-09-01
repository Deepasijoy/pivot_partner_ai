// Occupation/domain compatibility — a small, deterministic gate applied
// before recommendationService.ts's existing skill/experience score, so a
// candidate's raw skill overlap can no longer make a clearly unrelated job
// (e.g. a Marine Biologist matching a Data Analyst posting purely on
// Python/SQL) rank as if it were a genuinely good fit.
//
// Design intent, per the audit: this is a GATE/multiplier applied to the
// existing score, not a 5th additive weight (an additive term could still
// let raw skill overlap dominate) — see recommendationService.ts's
// scoreJob() for the integration point. It classifies into three tiers
// (plus an honest "unknown" when there isn't enough signal to say
// anything):
//   - same_domain: candidate's occupation and the job's occupation are the
//     same domain family — no adjustment, existing score stands.
//   - adjacent:    a plausible, well-understood career transition (e.g.
//     Journalist -> Content Strategist) or a job whose own text bridges
//     into the candidate's domain (e.g. "Environmental Data Analyst" for a
//     Marine Biologist) — a moderate discount, not a rejection.
//   - unrelated:   no domain relationship found at all — a sharp discount
//     plus a hard cap, so even a very high raw skill-overlap score can't
//     slip through as misleadingly "good."
//   - unknown:     the candidate's occupation (or, separately, the job's)
//     couldn't be determined from the available structured evidence. When
//     the CANDIDATE's domain is unresolvable, this is a true no-adjustment
//     pass-through (multiplier 1) — we have nothing at all to judge them
//     by, so the existing skill-based score is trusted as-is, exactly as
//     it already was before this module existed. When the candidate's
//     domain IS known but the JOB's couldn't be resolved even after the
//     hint-word bridging check below, this gets a real (but uncapped, and
//     less severe than 'unrelated') discount instead — see
//     WEAK_EVIDENCE_MULTIPLIER. That asymmetry is deliberate: an
//     unclassifiable candidate is never penalized for our keyword list's
//     gaps, but an unclassifiable JOB must not silently earn the same
//     confidence as a confirmed same-domain match either (that was the
//     concrete failure mode: informal titles like "Sales Jedi" or "Head of
//     People" landing in 'unknown' and outranking properly-gated jobs).
//
// Deliberately NOT a database of thousands of occupations: a small set of
// broad domain families, each defined by a short keyword list, plus a
// short table of explicitly curated adjacent-domain pairs for well-known
// transitions that don't share vocabulary (Journalist/Content Strategist
// shares no words at all). Extending this later (new families, new
// adjacency pairs, or swapping the keyword-match step for an embeddings-
// based similarity score) only touches this one file — recommendationService.ts
// only ever sees the typed OccupationCompatibilityResult below.

export type OccupationCompatibilityCategory = 'same_domain' | 'adjacent' | 'unrelated' | 'unknown';

export interface OccupationCompatibilityResult {
  category: OccupationCompatibilityCategory;
  // Applied multiplicatively to the existing skill/experience/industry/
  // transferable score in recommendationService.ts — never an additive
  // term. 1 for same_domain and unknown (no adjustment either way).
  multiplier: number;
  // Present only for 'unrelated' — an absolute ceiling applied after the
  // multiplier, so a very high raw score still can't read as "good."
  cap?: number;
  // Short, machine-readable tag for internal use/debugging/future
  // explanation work — never shown to the user directly as-is.
  reason:
    | 'same_domain'
    | 'adjacent_domain_pair'
    | 'related_domain_terms_present'
    | 'different_domain'
    | 'candidate_domain_unknown'
    | 'job_domain_unknown';
}

const SAME_DOMAIN_MULTIPLIER = 1;
const ADJACENT_MULTIPLIER = 0.85;
const UNRELATED_MULTIPLIER = 0.25;
const UNRELATED_CAP = 30;
// Applied only when the CANDIDATE's domain is confidently known but the
// JOB's title/description matched no recognized family AND showed none of
// the candidate's own domain's hint words either (see the bridging check in
// classifyOccupationCompatibility) — genuine missing evidence, not a
// confirmed mismatch. Per the design principle: insufficient evidence must
// not carry the same confidence as a same_domain match (1x), but it also
// isn't a confirmed 'unrelated' job, so it gets no hard cap — a real
// discount, deliberately less severe than 'unrelated's.
const WEAK_EVIDENCE_MULTIPLIER = 0.6;

interface DomainFamily {
  id: string;
  // Specific phrases that identify a ROLE or JOB as primarily this domain
  // (e.g. "marine biologist", "data analyst") — used for same-domain
  // matching. Kept reasonably specific to avoid over-triggering.
  titleKeywords: string[];
  // Broader, shorter words associated with this domain (e.g. "marine",
  // "environmental") — used only for the bridging check below, so a
  // compound/hybrid job title like "Environmental Data Analyst" can be
  // recognized as adjacent to a Marine Biologist even though its primary
  // domain (data analytics) is different.
  hintWords: string[];
}

const DOMAIN_FAMILIES: DomainFamily[] = [
  {
    id: 'software_engineering',
    titleKeywords: ['software engineer', 'software developer', 'programmer', 'full stack developer', 'backend developer', 'frontend developer', 'web developer', 'application developer'],
    hintWords: ['software', 'programming', 'codebase', 'engineering team'],
  },
  {
    id: 'data_analytics',
    titleKeywords: ['data analyst', 'data scientist', 'data engineer', 'business intelligence analyst', 'bi analyst'],
    hintWords: ['data analysis', 'analytics', 'dataset', 'dashboard'],
  },
  {
    id: 'cloud_devops',
    titleKeywords: ['devops engineer', 'site reliability engineer', 'cloud engineer', 'infrastructure engineer', 'platform engineer'],
    hintWords: ['devops', 'cloud infrastructure', 'deployment pipeline'],
  },
  {
    id: 'design_ux',
    titleKeywords: ['ux designer', 'ui designer', 'product designer', 'user experience designer', 'user interface designer'],
    hintWords: ['user experience', 'user interface', 'design system'],
  },
  {
    id: 'finance',
    titleKeywords: ['financial analyst', 'finance manager', 'banker', 'accountant', 'investment analyst', 'auditor', 'financial operations analyst'],
    hintWords: ['finance', 'financial', 'banking', 'accounting'],
  },
  {
    id: 'business_operations',
    titleKeywords: ['operations manager', 'business analyst', 'operations analyst', 'supply chain analyst'],
    hintWords: ['operations', 'process improvement', 'business process'],
  },
  {
    id: 'sales_marketing',
    titleKeywords: ['sales manager', 'marketing manager', 'business development manager', 'account executive', 'growth marketer'],
    hintWords: ['sales', 'marketing campaign', 'business development'],
  },
  {
    id: 'content_strategy',
    titleKeywords: ['content strategist', 'content marketing manager', 'content writer', 'copywriter'],
    hintWords: ['content strategy', 'editorial calendar', 'content marketing'],
  },
  {
    id: 'journalism_media',
    titleKeywords: ['journalist', 'reporter', 'news writer', 'correspondent', 'news editor'],
    hintWords: ['journalism', 'newsroom', 'editorial', 'reporting'],
  },
  {
    id: 'people_hr',
    titleKeywords: ['hr manager', 'human resources manager', 'recruiter', 'talent acquisition specialist', 'people operations manager'],
    hintWords: ['human resources', 'recruitment', 'talent acquisition'],
  },
  {
    id: 'customer_success',
    titleKeywords: ['customer success manager', 'account manager', 'client relationship manager'],
    hintWords: ['customer success', 'client relationship'],
  },
  {
    id: 'education',
    titleKeywords: ['teacher', 'instructor', 'educator', 'education coordinator', 'professor', 'tutor', 'academic coordinator'],
    hintWords: ['classroom', 'curriculum', 'pedagogy', 'academic'],
  },
  {
    id: 'learning_development',
    titleKeywords: ['learning and development specialist', 'learning & development specialist', 'instructional designer', 'training manager', 'corporate trainer'],
    hintWords: ['learning and development', 'instructional design', 'corporate training'],
  },
  {
    id: 'marine_environmental_science',
    titleKeywords: ['marine biologist', 'marine biology', 'marine scientist', 'marine science', 'oceanographer', 'oceanography', 'environmental scientist', 'environmental science', 'ecologist', 'ecology'],
    hintWords: ['marine', 'ocean', 'environmental', 'environment', 'ecological', 'conservation', 'wildlife', 'sustainability', 'climate'],
  },
  {
    id: 'life_sciences',
    titleKeywords: ['biologist', 'biology', 'laboratory technician', 'lab technician', 'research scientist', 'biotech researcher'],
    hintWords: ['laboratory', 'biology', 'biological', 'research study'],
  },
  {
    id: 'healthcare_nursing',
    titleKeywords: ['registered nurse', 'nurse practitioner', 'clinical nurse', 'nursing', 'physician', 'medical doctor'],
    hintWords: ['clinical', 'patient care', 'healthcare'],
  },
  {
    id: 'mechanical_engineering',
    titleKeywords: ['mechanical engineer', 'mechanical engineering'],
    hintWords: ['mechanical design', 'cad'],
  },
];

// Curated, generally-agreed adjacent transitions that don't necessarily
// share vocabulary (unlike the bridging check below, which relies on the
// job's own text). Deliberately small and symmetric — order within a pair
// doesn't matter.
const ADJACENT_DOMAIN_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['journalism_media', 'content_strategy'],
  ['education', 'learning_development'],
  ['marine_environmental_science', 'life_sciences'],
  ['data_analytics', 'business_operations'],
  ['finance', 'business_operations'],
  ['software_engineering', 'cloud_devops'],
];

// Conservative, deliberately non-exhaustive — an industry the resume
// parser already detected (resumeParserService.ts's INDUSTRY_KEYWORDS) is
// only mapped here when the industry label is itself close to synonymous
// with a specific occupation domain. Ambiguous industries (SaaS,
// E-commerce, Retail, Logistics, Consulting, General Business) are
// deliberately left unmapped — they say too little about the candidate's
// actual occupation to gate on, so they fall through to 'unknown' instead.
const INDUSTRY_TO_DOMAIN: Record<string, string> = {
  'Marine Science': 'marine_environmental_science',
  'Environmental Science': 'marine_environmental_science',
  'Life Sciences': 'life_sciences',
  'Journalism & Media': 'journalism_media',
  Education: 'education',
  Finance: 'finance',
  Fintech: 'finance',
  Healthcare: 'healthcare_nursing',
  Operations: 'business_operations',
  Marketing: 'sales_marketing',
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Word-bounded phrase match: normalize() reduces everything to lowercase
// alphanumerics separated by single spaces, so a boundary is simply the
// string's own edge or an adjacent space — this is the same approach
// geoMatch.ts uses for destination text, reimplemented locally here rather
// than imported, since occupation matching and geographic matching are
// unrelated concerns that happen to want the same small primitive.
function containsPhrase(haystack: string, phrase: string): boolean {
  const normalizedPhrase = normalize(phrase);
  if (!normalizedPhrase) return false;
  const pattern = new RegExp(`(?:^|\\s)${normalizedPhrase}(?:\\s|$)`);
  return pattern.test(haystack);
}

function findFamily(domainId: string): DomainFamily | undefined {
  return DOMAIN_FAMILIES.find((family) => family.id === domainId);
}

function domainsMatchingText(normalizedText: string): Set<string> {
  const matched = new Set<string>();
  for (const family of DOMAIN_FAMILIES) {
    if (family.titleKeywords.some((keyword) => containsPhrase(normalizedText, keyword))) {
      matched.add(family.id);
    }
  }
  return matched;
}

/**
 * Resolves the candidate's own occupation domain — `likelyRole` first (the
 * strongest, most direct signal, exactly as resumeParserService.ts
 * extracted it, never re-interpreted), falling back to a resolved
 * industry only when no role title is available at all. Returns null when
 * neither signal maps to a recognized domain family — a genuinely
 * unrecognized or absent occupation is never guessed at.
 */
export function resolveCandidateDomain(
  likelyRole: string | undefined,
  industries: string[] | undefined
): string | null {
  if (likelyRole?.trim()) {
    const normalizedRole = normalize(likelyRole);
    const matched = domainsMatchingText(normalizedRole);
    if (matched.size > 0) {
      // A role can only be classified into one primary domain — first
      // match in DOMAIN_FAMILIES definition order wins, deterministic.
      return DOMAIN_FAMILIES.find((family) => matched.has(family.id))?.id ?? null;
    }
  }

  for (const industry of industries ?? []) {
    const domainId = INDUSTRY_TO_DOMAIN[industry];
    if (domainId) return domainId;
  }

  return null;
}

function resolveJobDomains(jobTitle: string, jobDescription: string): Set<string> {
  const normalizedTitle = normalize(jobTitle);
  const fromTitle = domainsMatchingText(normalizedTitle);
  if (fromTitle.size > 0) return fromTitle;

  // Title alone was too generic ("Analyst", "Specialist", ...) — fall
  // back to the description, the same "more than just the first few words
  // of the title" evidence the task asks for.
  const normalizedDescription = normalize(jobDescription);
  return domainsMatchingText(normalizedDescription);
}

function areStaticallyAdjacent(domainA: string, domainB: string): boolean {
  return ADJACENT_DOMAIN_PAIRS.some(
    ([a, b]) => (a === domainA && b === domainB) || (a === domainB && b === domainA)
  );
}

/**
 * The main entry point — see the module comment above for the full
 * category/multiplier design. Never throws; always returns a usable
 * result, including when the candidate's role/industries and/or the job's
 * title/description give no usable signal at all ('unknown', no
 * adjustment).
 */
export function classifyOccupationCompatibility(
  candidateLikelyRole: string | undefined,
  candidateIndustries: string[] | undefined,
  jobTitle: string,
  jobDescription: string | undefined
): OccupationCompatibilityResult {
  const candidateDomainId = resolveCandidateDomain(candidateLikelyRole, candidateIndustries);
  if (!candidateDomainId) {
    return { category: 'unknown', multiplier: 1, reason: 'candidate_domain_unknown' };
  }

  const jobDomains = resolveJobDomains(jobTitle, jobDescription ?? '');

  if (jobDomains.has(candidateDomainId)) {
    return { category: 'same_domain', multiplier: SAME_DOMAIN_MULTIPLIER, reason: 'same_domain' };
  }

  for (const jobDomainId of jobDomains) {
    if (areStaticallyAdjacent(candidateDomainId, jobDomainId)) {
      return { category: 'adjacent', multiplier: ADJACENT_MULTIPLIER, reason: 'adjacent_domain_pair' };
    }
  }

  // Bridging check — does the JOB'S OWN text show any sign of the
  // candidate's domain, even when its title/description didn't match any
  // recognized family at all (jobDomains.size === 0)? DOMAIN_FAMILIES's
  // titleKeywords are deliberately narrow, so plenty of genuinely relevant,
  // informally- or differently-worded titles ("Digital Marketing Sales
  // Executive" for a marketing candidate) never match a family outright —
  // this is what still recognizes them as a credible transition instead of
  // falling into the weak-evidence bucket below purely because the keyword
  // list didn't happen to cover that phrasing.
  const candidateFamily = findFamily(candidateDomainId);
  const combinedJobText = normalize(`${jobTitle} ${jobDescription ?? ''}`);
  if (candidateFamily?.hintWords.some((hint) => containsPhrase(combinedJobText, hint))) {
    return { category: 'adjacent', multiplier: ADJACENT_MULTIPLIER, reason: 'related_domain_terms_present' };
  }

  if (jobDomains.size === 0) {
    // The job's title/description gave no signal at all — not a
    // recognized family, not even the candidate's own domain's hint words.
    // Genuine missing evidence, not a confirmed mismatch: an informal or
    // unusual title ("Head of People", "Sales Jedi", "Senior Independent AI
    // Engineer / Architect") legitimately can't be classified from this
    // small, non-exhaustive keyword list, but that is not the same thing as
    // confirming it's unrelated — see WEAK_EVIDENCE_MULTIPLIER above.
    return { category: 'unknown', multiplier: WEAK_EVIDENCE_MULTIPLIER, reason: 'job_domain_unknown' };
  }

  return { category: 'unrelated', multiplier: UNRELATED_MULTIPLIER, cap: UNRELATED_CAP, reason: 'different_domain' };
}
