import type { ResumeProfile } from '../types';

// Derives a small set of job-title search terms from a parsed resume
// profile, for use as Adzuna's `what` query. Deliberately does NOT search
// every detected skill (that produces noisy, unfocused queries) and does
// NOT fall back to any single hard-coded universal title. Pure and
// synchronous — no network/Groq calls, so it adds no latency or
// non-determinism to a job search.

export type JobQuerySource = 'likely_role' | 'skill_cluster' | 'industry_only' | 'seniority_fallback';

export interface JobQueryResult {
  // Best single term to search first.
  primaryQuery: string;
  // Additional candidate terms from the same cluster/signal, for a caller
  // that wants to try more than one search.
  alternateQueries: string[];
  // Which signal actually produced the result — lets a caller (or a log)
  // see why this query was chosen.
  source: JobQuerySource;
  // Short human-readable explanation of the decision, for debugging.
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Skill → role-cluster mapping. Each cluster lists the exact taxonomy skill
// names (mockSkillTaxonomy, src/services/mockData.ts) that signal it, plus
// the job titles it should search for. A profile's dominant cluster is
// whichever one it has the most matching skills in.
// ---------------------------------------------------------------------------

interface RoleCluster {
  id: string;
  skillNames: string[];
  queryTerms: string[];
  // Industry labels (from resumeParserService's INDUSTRY_KEYWORDS output)
  // that reinforce this cluster, used only to break ties between clusters
  // with an equal skill-match count — never to rewrite the query terms.
  relatedIndustries?: string[];
}

const ROLE_CLUSTERS: RoleCluster[] = [
  {
    id: 'software_engineering',
    skillNames: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Git', 'REST APIs', 'System Design'],
    queryTerms: ['Full Stack Developer', 'Software Engineer', 'React Developer'],
    relatedIndustries: ['SaaS'],
  },
  {
    id: 'data_analytics',
    // 'Excel' is also in the 'finance' cluster below — the first skill name
    // shared across two clusters in this table (every other entry is
    // disjoint). Added here deliberately, not by oversight: confirmed
    // against ESCO's own occupation-skill-relations data that "use
    // spreadsheets software" is a real (optional, not essential) skill of
    // ESCO's "data analyst" occupation (occ:2014) — unlike SQL/Python,
    // which are absent from that occupation's essential AND optional lists
    // entirely and remain a documented backlog item (see
    // occupationMatchingService.ts's resolveCandidateOccupation() BACKLOG
    // comment), this addition has genuine ESCO corroboration behind it,
    // not just a hand-curated guess.
    skillNames: ['Python', 'SQL', 'Data Analysis', 'Power BI', 'Tableau', 'Machine Learning', 'TensorFlow', 'Data-Driven Decision Making', 'Excel'],
    queryTerms: ['Data Analyst', 'Business Intelligence Analyst', 'Data Scientist'],
  },
  {
    id: 'cloud_devops',
    skillNames: ['AWS', 'Docker', 'Kubernetes', 'DevOps', 'CI/CD', 'Cloud Architecture'],
    queryTerms: ['DevOps Engineer', 'Cloud Engineer', 'Site Reliability Engineer'],
  },
  {
    id: 'design_ux',
    skillNames: ['Figma', 'UI/UX Design'],
    queryTerms: ['UX Designer', 'Product Designer', 'UI Designer'],
  },
  {
    id: 'finance',
    skillNames: ['Financial Modeling', 'Financial Analysis', 'Excel', 'Budgeting', 'Forecasting'],
    queryTerms: ['Financial Analyst', 'Finance Manager', 'Business Analyst'],
    relatedIndustries: ['Fintech', 'Finance'],
  },
  {
    id: 'business_operations',
    skillNames: ['Business Strategy', 'Operations Management', 'Process Optimization', 'Project Management', 'Agile/Scrum', 'Market Research'],
    queryTerms: ['Operations Manager', 'Business Analyst', 'Project Manager'],
    relatedIndustries: ['Consulting', 'Logistics'],
  },
  {
    id: 'sales_marketing',
    skillNames: ['Sales Strategy', 'Marketing Strategy', 'SEO', 'Content Writing', 'CRM (Salesforce/HubSpot)', 'Business Development'],
    queryTerms: ['Marketing Manager', 'Sales Manager', 'Business Development Manager'],
    relatedIndustries: ['Marketing', 'Retail', 'E-commerce'],
  },
  {
    id: 'people_hr',
    skillNames: ['HR Management', 'Recruitment', 'Negotiation'],
    queryTerms: ['HR Manager', 'People Operations Manager', 'Talent Acquisition Manager'],
  },
  {
    id: 'customer_success',
    skillNames: ['Customer Success', 'Stakeholder Management', 'Public Speaking'],
    queryTerms: ['Customer Success Manager', 'Account Manager', 'Client Relationship Manager'],
  },
];

// Industry-only fallback: used when no skill cluster matched at all (e.g.
// sparse skill detection) but an industry was still identified. Covers the
// same industry labels resumeParserService.ts's INDUSTRY_KEYWORDS produces,
// plus 'Education' — included even though the current skill taxonomy has no
// education-domain skills yet, since industry detection alone can surface
// it (INDUSTRY_KEYWORDS already includes 'education').
const INDUSTRY_ROLE_HINTS: Record<string, string[]> = {
  Fintech: ['Financial Analyst', 'Finance Manager', 'Business Analyst'],
  Finance: ['Financial Analyst', 'Finance Manager', 'Business Analyst'],
  Healthcare: ['Healthcare Administrator', 'Operations Manager', 'Program Coordinator'],
  'E-commerce': ['E-commerce Manager', 'Operations Manager', 'Marketing Manager'],
  Education: ['Teacher', 'Education Coordinator', 'Academic Manager'],
  Retail: ['Retail Manager', 'Operations Manager', 'Merchandising Manager'],
  SaaS: ['Product Manager', 'Customer Success Manager', 'Business Analyst'],
  Marketing: ['Marketing Manager', 'Content Strategist', 'Marketing Coordinator'],
  Logistics: ['Operations Manager', 'Supply Chain Analyst', 'Logistics Coordinator'],
  Consulting: ['Business Analyst', 'Management Consultant', 'Operations Manager'],
};

// A side/personal/academic project mention is still real evidence of a
// skill — it's down-weighted, never zeroed out — but at a fraction of a
// Professional-Experience or certification-backed skill's vote, so an
// incidental one-off tool mention can't outvote a candidate's actual,
// sustained or credentialed skillset. This closed a real, reproduced case:
// a side project mentioning 4 different web technologies previously tied
// (and in one further tested case, even beat) a candidate's real Power
// BI/SQL/Python/data-analytics-certificate skillset for cluster-matching
// purposes, which was the direct cause of "Data Analyst" never winning the
// job-search query for a banking/credit-ops candidate actively targeting
// data-analyst roles.
const SIDE_PROJECT_SKILL_WEIGHT = 0.4;

// A skill self-declared in a dedicated Key-Skills/Skills-Summary section is
// a more deliberate signal than an incidental in-bullet mention — the
// candidate chose to headline it — so it counts for MORE than an ordinary
// mention, the mirror image of SIDE_PROJECT_SKILL_WEIGHT. 1.5x: large
// enough to meaningfully separate a cluster whose skills are genuinely
// headlined from one that only shows up incidentally, without being so
// large that a single self-declared skill can single-handedly overwhelm
// several genuine, differently-sourced mentions elsewhere (which would
// make the signal too brittle to one placement choice). Stress-tested
// against both a focused and a "kitchen sink" (broad, non-discriminating)
// Key Skills section before being wired in here — see the module's own
// test coverage / the sprint report for the real computed numbers: it
// reliably breaks a tie when the section is focused, and is a proven no-op
// (never a regression) when it isn't, since boosting every cluster's votes
// by the same factor can't change their relative ordering.
const KEY_SKILLS_SKILL_WEIGHT = 1.5;

// A skill can be BOTH self-declared in Key Skills AND mentioned once in a
// side project — e.g. genuinely used professionally and also in a personal
// project. Key-Skills membership wins outright in that case (checked
// first, and short-circuits before the side-project check even runs): a
// deliberate self-declaration is at least as strong a signal as an
// incidental mention, never weaker, so the discount never applies once
// self-declaration is confirmed — this is an override, not an average.
function skillWeight(
  name: string,
  lowConfidenceSkillNames: Set<string> | undefined,
  highConfidenceSkillNames: Set<string> | undefined
): number {
  const normalized = name.toLowerCase();
  if (highConfidenceSkillNames?.has(normalized)) return KEY_SKILLS_SKILL_WEIGHT;
  if (lowConfidenceSkillNames?.has(normalized)) return SIDE_PROJECT_SKILL_WEIGHT;
  return 1;
}

function countMatchingSkills(
  cluster: RoleCluster,
  skillNames: Set<string>,
  lowConfidenceSkillNames: Set<string> | undefined,
  highConfidenceSkillNames: Set<string> | undefined
): number {
  let total = 0;
  for (const name of cluster.skillNames) {
    const normalized = name.toLowerCase();
    if (skillNames.has(normalized)) total += skillWeight(normalized, lowConfidenceSkillNames, highConfidenceSkillNames);
  }
  return total;
}

export interface DominantSkillClusterMatch {
  // Every cluster tied for the top (weighted) match count — more than one
  // entry means a genuine tie (deriveJobQuery() below tie-breaks by
  // industry alignment or definition order; a caller that only wants a
  // CLEAR, unambiguous signal should treat length > 1 as "no clear
  // winner").
  clusters: RoleCluster[];
  // Shared weighted match count across every cluster in `clusters` (0 when
  // none matched at all). A fractional number whenever a side-project-only
  // or Key-Skills-section skill contributed to it — see
  // SIDE_PROJECT_SKILL_WEIGHT / KEY_SKILLS_SKILL_WEIGHT.
  matchCount: number;
}

// Finds the skill cluster(s) (ROLE_CLUSTERS above) whose skillNames overlap
// most with the given skills, by WEIGHTED count — the same "which
// occupation do these skills actually point to" computation deriveJobQuery()
// already does for query construction. `lowConfidenceSkillNames` /
// `highConfidenceSkillNames` (resumeParserService.ts's
// ResumeProfile.lowConfidenceSkillNames / highConfidenceSkillNames) are
// both optional and additive: omitting either (or both) weights every
// affected skill at the plain default of 1, exactly today's prior
// (unweighted) behavior, so a caller with no section information (e.g.
// scoring a job listing's own required skills, which have no "section"
// concept at all) is unaffected.
export function findDominantSkillClusters(
  skills: { name: string }[],
  lowConfidenceSkillNames?: string[],
  highConfidenceSkillNames?: string[]
): DominantSkillClusterMatch {
  const skillNames = new Set(skills.map((skill) => skill.name.toLowerCase()));
  if (skillNames.size === 0) return { clusters: [], matchCount: 0 };

  const lowConfidenceSet = lowConfidenceSkillNames
    ? new Set(lowConfidenceSkillNames.map((name) => name.toLowerCase()))
    : undefined;
  const highConfidenceSet = highConfidenceSkillNames
    ? new Set(highConfidenceSkillNames.map((name) => name.toLowerCase()))
    : undefined;

  let bestClusters: RoleCluster[] = [];
  let bestCount = 0;

  for (const cluster of ROLE_CLUSTERS) {
    const count = countMatchingSkills(cluster, skillNames, lowConfidenceSet, highConfidenceSet);
    if (count > bestCount) {
      bestCount = count;
      bestClusters = [cluster];
    } else if (count === bestCount && count > 0) {
      bestClusters.push(cluster);
    }
  }

  return { clusters: bestClusters, matchCount: bestCount };
}

function clusterMatchesIndustry(cluster: RoleCluster, industries: string[]): boolean {
  if (!cluster.relatedIndustries) return false;
  const lowerIndustries = industries.map((industry) => industry.toLowerCase());
  return cluster.relatedIndustries.some((industry) => lowerIndustries.includes(industry.toLowerCase()));
}

// Returns the ROLE_CLUSTERS entry `role`'s own text names (a substring
// match against that cluster's query terms, either direction) — used only
// to sanity-check profile.likelyRole against the skill-derived cluster in
// deriveJobQuery() below, never to choose a query term itself.
function clusterMatchingRoleText(role: string): RoleCluster | undefined {
  const normalizedRole = role.toLowerCase();
  return ROLE_CLUSTERS.find((cluster) =>
    cluster.queryTerms.some((term) => {
      const normalizedTerm = term.toLowerCase();
      return normalizedRole.includes(normalizedTerm) || normalizedTerm.includes(normalizedRole);
    })
  );
}

// A (weighted) skill-cluster match this small (a single incidental shared
// skill) isn't a strong enough signal to override an explicitly stated,
// off-catalog role — only a real, multi-skill cluster match can do that.
// See deriveJobQuery()'s use of this below.
const MIN_CONFLICTING_SKILL_MATCH = 2;

function isSeniorLevel(seniority: string | undefined): boolean {
  if (!seniority) return false;
  return /senior|lead|principal/i.test(seniority);
}

function applySeniorityModifier(term: string, seniority: string | undefined): string {
  if (!isSeniorLevel(seniority)) return term;
  if (/senior|lead|principal/i.test(term)) return term; // already has a level qualifier
  return `Senior ${term}`;
}

/**
 * Derives job-search terms for a resume profile, in priority order:
 * 1. profile.likelyRole, if the parser/AI already identified one, UNLESS
 *    it's "off-catalog" (its own text doesn't name any ROLE_CLUSTERS job
 *    family at all — see clusterMatchingRoleText()) AND a decisive
 *    (weighted) skill-cluster match points somewhere concrete — see
 *    MIN_CONFLICTING_SKILL_MATCH. An ON-catalog stated role (its text
 *    itself names a real cluster, e.g. "Data Analyst" or "Full Stack
 *    Developer") is trusted OUTRIGHT here, never re-litigated against the
 *    skill-cluster count: re-litigating that case is exactly what caused a
 *    real, reproduced regression — an explicit, correct "Data Analyst"
 *    stated role lost to a side project's incidental tech-stack mentions
 *    winning the raw cluster count. Only a genuinely off-catalog role (one
 *    that doesn't map to any cluster's own vocabulary, e.g. a stale past
 *    job title like "Senior Credit Operations Officer") is checked against
 *    the skill evidence at all; a merely absent or weak skill signal still
 *    never overrides it in that case either.
 * 2. The dominant (weighted) skill cluster, tie-broken by industry
 *    alignment — see findDominantSkillClusters()'s skill-weighting.
 * 3. An industry-only hint, if no skill cluster matched but an industry did.
 * 4. A generic seniority-based fallback — never a fixed literal title.
 * Seniority is applied as a "Senior " prefix modifier on the primary term
 * only, when useful (steps 2–3), not on an already-specific likelyRole.
 */
export function deriveJobQuery(profile: ResumeProfile): JobQueryResult {
  const industries = profile.industries ?? [];
  const { clusters: bestClusters, matchCount: bestCount } = findDominantSkillClusters(
    profile.skills,
    profile.lowConfidenceSkillNames,
    profile.highConfidenceSkillNames
  );

  const role = profile.likelyRole?.trim();
  if (role) {
    const roleCluster = clusterMatchingRoleText(role);
    // Only an off-catalog role is even eligible to be overridden — see this
    // function's own doc comment for why an on-catalog one never is.
    const outweighedByDecisiveSkillMatch = roleCluster === undefined && bestCount >= MIN_CONFLICTING_SKILL_MATCH;

    if (!outweighedByDecisiveSkillMatch) {
      return {
        primaryQuery: role,
        alternateQueries: [],
        source: 'likely_role',
        reasoning:
          roleCluster !== undefined
            ? `Used profile.likelyRole ("${role}") directly — it names a recognized "${roleCluster.id}" job family, trusted outright regardless of raw skill-cluster counts.`
            : `Used profile.likelyRole ("${role}") directly — the strongest available signal.`,
      };
    }
    // Falls through to the skill-cluster logic below: `role` doesn't map to
    // any known job family, and ${bestCount} weighted skill point(s) point
    // somewhere concrete instead.
  }

  if (bestCount > 0) {
    // Tie-break by industry alignment; otherwise first-defined cluster wins
    // (deterministic — cluster definition order, not random).
    const industryMatch = bestClusters.find((cluster) => clusterMatchesIndustry(cluster, industries));
    const chosen = industryMatch ?? bestClusters[0];

    const [primary, ...rest] = chosen.queryTerms;
    return {
      primaryQuery: applySeniorityModifier(primary, profile.seniority),
      alternateQueries: rest,
      source: 'skill_cluster',
      reasoning:
        `Matched ${bestCount} weighted skill point(s) to the "${chosen.id}" cluster` +
        (industryMatch ? ` (tie-broken by industry match)` : bestClusters.length > 1 ? ` (tie-broken by definition order)` : '') +
        (role ? ` — outweighs stated role "${role}", which doesn't map to any known job family` : '') +
        `.`,
    };
  }

  const industryHint = industries.find((industry) => INDUSTRY_ROLE_HINTS[industry]);
  if (industryHint) {
    const [primary, ...rest] = INDUSTRY_ROLE_HINTS[industryHint];
    return {
      primaryQuery: applySeniorityModifier(primary, profile.seniority),
      alternateQueries: rest,
      source: 'industry_only',
      reasoning: `No skill cluster matched; used the "${industryHint}" industry hint instead.`,
    };
  }

  const seniority = profile.seniority?.trim();
  const primaryQuery = seniority ? `${seniority} Professional` : 'Professional';
  return {
    primaryQuery,
    alternateQueries: [],
    source: 'seniority_fallback',
    reasoning: 'No likelyRole, matching skill cluster, or usable industry — used a generic, non-domain-specific fallback.',
  };
}
