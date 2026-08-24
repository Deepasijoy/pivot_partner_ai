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
    skillNames: ['Python', 'SQL', 'Data Analysis', 'Power BI', 'Tableau', 'Machine Learning', 'TensorFlow', 'Data-Driven Decision Making'],
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

function countMatchingSkills(cluster: RoleCluster, skillNames: Set<string>): number {
  return cluster.skillNames.filter((name) => skillNames.has(name.toLowerCase())).length;
}

function clusterMatchesIndustry(cluster: RoleCluster, industries: string[]): boolean {
  if (!cluster.relatedIndustries) return false;
  const lowerIndustries = industries.map((industry) => industry.toLowerCase());
  return cluster.relatedIndustries.some((industry) => lowerIndustries.includes(industry.toLowerCase()));
}

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
 * 1. profile.likelyRole, if the parser/AI already identified one.
 * 2. The dominant skill cluster (most matching skills), tie-broken by
 *    industry alignment.
 * 3. An industry-only hint, if no skill cluster matched but an industry did.
 * 4. A generic seniority-based fallback — never a fixed literal title.
 * Seniority is applied as a "Senior " prefix modifier on the primary term
 * only, when useful (steps 2–3), not on an already-specific likelyRole.
 */
export function deriveJobQuery(profile: ResumeProfile): JobQueryResult {
  if (profile.likelyRole && profile.likelyRole.trim()) {
    const role = profile.likelyRole.trim();
    return {
      primaryQuery: role,
      alternateQueries: [],
      source: 'likely_role',
      reasoning: `Used profile.likelyRole ("${role}") directly — the strongest available signal.`,
    };
  }

  const skillNames = new Set(profile.skills.map((skill) => skill.name.toLowerCase()));
  const industries = profile.industries ?? [];

  if (skillNames.size > 0) {
    let bestClusters: RoleCluster[] = [];
    let bestCount = 0;

    for (const cluster of ROLE_CLUSTERS) {
      const count = countMatchingSkills(cluster, skillNames);
      if (count > bestCount) {
        bestCount = count;
        bestClusters = [cluster];
      } else if (count === bestCount && count > 0) {
        bestClusters.push(cluster);
      }
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
          `Matched ${bestCount} skill(s) to the "${chosen.id}" cluster` +
          (industryMatch ? ` (tie-broken by industry match)` : bestClusters.length > 1 ? ` (tie-broken by definition order)` : '') +
          `.`,
      };
    }
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
