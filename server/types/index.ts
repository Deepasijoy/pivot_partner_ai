import type { ResumeProfile, JobOpportunity, CareerRecommendation, SkillGap } from '../../src/types';

export interface ChatContext {
  profile?: Partial<ResumeProfile>;
  selectedJob?: JobOpportunity | null;
  careerRecommendations?: CareerRecommendation[];
  skillGaps?: SkillGap[];
}

export interface ChatRequestBody {
  message: string;
  context?: ChatContext;
}

export interface ChatResponseBody {
  message: string;
}

export interface AnalyzeResumeRequestBody {
  resumeText: string;
}

export interface ApiErrorResponse {
  error: string;
}
