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
  category: 'technical' | 'business';
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

export interface CareerPath {
  id: string;
  title: string;
  matchPercentage: number;
  whyItFits: string;
  salaryRange: string;
  opportunities: number;
  skillGaps: SkillGap[];
  recommendedAction: string;
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
}

export interface FreelanceGig {
  id: string;
  title: string;
  budget: string;
  duration: string;
  requiredSkills: Skill[];
  matchPercentage: number;
  platform: string;
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

export interface CareerRecommendation {
  id: string;
  title: string;
  matchScore: number;
  reason: string;
  salaryRange: string;
  opportunityCount: number;
  missingSkills: Skill[];
  matchedSkills: Skill[];
  recommendedAction: string;
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// The app's top-level navigation state: the four pillars, plus the
// dashboard/home overview that sits above them. Shared between App.tsx
// and TabNavigation.tsx so both stay in sync on the same union.
export type AppTab = 'dashboard' | 'relocation' | 'career' | 'life' | 'community';
export type PillarTab = Exclude<AppTab, 'dashboard'>;
