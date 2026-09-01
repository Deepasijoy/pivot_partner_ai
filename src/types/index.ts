export interface UserProfile {
  id: string;
  name: string;
  email: string;
  targetLocation: string;
  familySize: number;
  workPreferences: string[];
}

export interface Skill {
  name: string;
  // 'general' is for a skill whose technical/business nature genuinely
  // isn't known (e.g. an unrecognized skill preserved from free text) —
  // an honest "unclassified," never a guessed technical/business label.
  // Every taxonomy skill (mockData.ts) still uses only 'technical'/'business'.
  category: 'technical' | 'business' | 'general';
  demandLevel: 'very_high' | 'high' | 'medium';
  proficiency: number;
}

export interface SuggestedCareerPath {
  title: string;
  reason: string;
}

export interface ResumeProfile {
  skills: Skill[];
  experience: string;
  yearsExperience: number;
  industries: string[];
  // Optional — populated only when the profile comes from the backend's
  // Claude-powered POST /api/analyze-resume. The existing mock
  // resumeParserService does not set these, so all consumers must treat
  // them as optional.
  professionalSummary?: string;
  likelyRole?: string;
  seniority?: string;
  transferableSkills?: Skill[];
  careerPaths?: SuggestedCareerPath[];
}

export interface SkillGap {
  skill: Skill;
  currentLevel: number;
  requiredLevel: number;
  estimatedTimeWeeks: number;
}

// The occupation/domain-compatibility tier computed by
// occupationMatchingService.ts's classifyOccupationCompatibility() —
// 'unrelated' jobs are already filtered out of matchScore's raw-vs-gated
// gap before a caller ever sees this field, so only the three surviving
// outcomes (plus 'unknown', when there wasn't enough evidence to classify
// at all) are representable here. Present only on jobs/paths that went
// through the occupation-aware scoring path (recommendationService.ts's
// getCareerRecommendations, matchingService.ts's matchJobsForUser/
// generateCareerPaths) — absent on mock/mock-derived data that predates
// that computation or on any consumer that hasn't opted in to reading it.
export type OccupationCategory = 'same_domain' | 'adjacent' | 'unrelated' | 'unknown';

// Distinguishes what kind of evidence a CareerPath's numbers actually rest
// on (matchingService.ts's buildJobCareerPath) — 'ready_now' (candidate has
// every detected requirement), 'skill_enhanced' (a genuine partial overlap,
// with real remaining gaps), or 'insufficient_data' (the listing had no
// detectable required skills at all, so 0 skillGaps is NOT evidence of a
// match — it means there was nothing to compare against). Consumers (e.g.
// SkillAnalysis.tsx's Timeline row) must check this before treating an
// empty skillGaps array as "ready now."
export type CareerPathDataState = 'ready_now' | 'skill_enhanced' | 'insufficient_data';

export interface CareerPath {
  id: string;
  title: string;
  matchPercentage: number;
  whyItFits: string;
  salaryRange: string;
  opportunities: number;
  skillGaps: SkillGap[];
  recommendedAction: string;
  // See OccupationCategory above — lets a caller (e.g. aiContextService.ts)
  // ground an AI explanation in the same compatibility tier the score
  // itself already reflects, without recomputing anything.
  occupationCategory?: OccupationCategory;
  // See CareerPathDataState above. Absent only on a path built before this
  // field existed (there are none in the current codebase — every
  // CareerPath is now built by matchingService.ts, which always sets it).
  dataState?: CareerPathDataState;
  // True only for the honest "no relevant freelance opportunity" placeholder
  // (see matchingService.ts's buildFreelanceCareerPath, Step D) — every
  // other field on this path is a neutral default (0%, no gaps) when this
  // is true, and SkillAnalysis.tsx renders the honest message instead of a
  // normal match card.
  isUnavailable?: boolean;
}

export interface JobOpportunity {
  id: string;
  title: string;
  company: string;
  salaryRange: string;
  timezone: string;
  matchScore: number;
  requiredSkills: Skill[];
  matchedSkills: Skill[];
  missingSkills: Skill[];
  description: string;
  employmentMatch: number;
  // The source listing's real application/redirect URL (e.g. Adzuna's
  // redirect_url), passed through unmodified. Absent for mock/example jobs.
  applyUrl?: string;
  // Raw ISO date string exactly as the provider gave it, where it gave
  // one — never invented. See jobFreshness.ts for parsing/display; always
  // go through that module rather than trusting this string directly, a
  // provider's date field is not guaranteed parseable.
  postedAt?: string;
  // Which provider this live listing came from (e.g. "adzuna", "remotive")
  // — for a small, subtle attribution note in the UI. Absent for
  // mock/example jobs, which have no real provider.
  source?: string;
  // Set only for jobs from a live 'remote' search (see
  // jobAggregatorService.ts's filterByDestination /
  // providers/geoMatch.ts's classifyRemoteEligibility) — 'confirmed' when
  // a provider's own structured/free-text signal explicitly names the
  // destination (or worldwide/a matching region); 'unclear' when the job
  // was kept despite having no eligibility signal at all. Absent for
  // local/hybrid and mock/example jobs, where it has no meaning.
  remoteEligibilityStatus?: 'confirmed' | 'unclear';
  // See OccupationCategory above.
  occupationCategory?: OccupationCategory;
}

export interface FreelanceGig {
  id: string;
  title: string;
  budget: string;
  duration: string;
  requiredSkills: Skill[];
  matchPercentage: number;
  platform: string;
  // See OccupationCategory above — set by matchingService.ts's
  // matchFreelanceForUser once occupation-aware gating is applied (Step D).
  occupationCategory?: OccupationCategory;
}

export interface CourseRecommendation {
  id: string;
  title: string;
  platform: string;
  durationWeeks: number;
  cost: string;
  skillGained: string;
}

export interface SalaryBenchmark {
  role: string;
  remote: string;
  local: string;
}

export interface FinanceScenario {
  salary: number;
  annualTaxes: number;
  annualExpenses: number;
  annualNet: number;
  monthlyNet: number;
}

export interface CVVersion {
  id: string;
  original: string;
  optimized: string;
  targetRole?: string;
}

export interface EmploymentRoute {
  fromCountry: string;
  toCountry: string;
  viability: number;
}

export interface CommunityPost {
  id: string;
  author: string;
  title: string;
  content: string;
  category: string;
}

// How the user wants to work — collected once per session via the
// work-model preference step in Career & Income (JobMatcherTab). 'hybrid'
// is geographically treated like 'local' (same destination city/region
// requirement) — see jobAggregatorService.ts's destination filtering.
export type WorkModel = 'local' | 'hybrid' | 'remote' | 'freelance';

// Same options plus "not sure yet" — used by the dashboard's relocation
// profile, where the user may not have decided on a work model.
export type PreferredWorkModel = WorkModel | 'not_sure';

export interface CareerRecommendation {
  id: string;
  title: string;
  company: string;
  workModel: WorkModel;
  matchScore: number;
  reason: string;
  salaryRange: string;
  opportunityCount: number;
  missingSkills: Skill[];
  matchedSkills: Skill[];
  recommendedAction: string;
  // Same passthrough as JobOpportunity.applyUrl — absent for mock/example
  // recommendations.
  applyUrl?: string;
  // Same passthrough as JobOpportunity.postedAt/source — see there.
  postedAt?: string;
  source?: string;
  // See OccupationCategory above.
  occupationCategory?: OccupationCategory;
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  // Optional deterministic call-to-action attached to an assistant message
  // (e.g. a button guiding the user to the resume parser). Absent for
  // ordinary Groq-answered messages.
  action?: 'open-resume-parser';
}

// User-set refinements for the Housing resource-link search (Life Setup ->
// HousingResources). Every field is optional and additive to the resolved
// destination — these only change the text of the external Google
// Search/Maps queries built in destinationResourceService.ts, never a
// listings API or ranking system.
export interface HousingFilters {
  // Neighbourhood/area refinement within the resolved destination (e.g.
  // "Alfama") — distinct from the top-level destination field, which is
  // city/country level.
  area?: string;
  // Monthly budget ceiling. Currency-neutral by design — the app has no
  // reliable per-destination currency mapping for arbitrary worldwide
  // locations (currencyConfig in services/config.ts only covers a small,
  // unrelated fixed set of finance-scenario cities), so no symbol or
  // conversion is applied.
  budgetMax?: number;
  bedrooms?: string;
  propertyType?: string;
  furnished?: 'any' | 'furnished' | 'unfurnished';
  familyFriendly?: boolean;
}

// The app's top-level navigation state: the four pillars, plus the
// dashboard/home overview that sits above them. Shared between App.tsx
// and TabNavigation.tsx so both stay in sync on the same union.
export type AppTab = 'dashboard' | 'relocation' | 'career' | 'life' | 'community';
export type PillarTab = Exclude<AppTab, 'dashboard'>;
