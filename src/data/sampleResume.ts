import type { ResumeProfile } from '../types';

// A pre-loaded, realistic profile used only by Career & Income's "Try a
// sample resume" path (JobMatcherTab.tsx) — lets a first-time visitor see
// the real skill-gap/job-matching pipeline run before committing to
// uploading their own resume. Every field here is shaped exactly like
// resumeParserService.ts's real output (same Skill taxonomy names as
// mockData.ts, so downstream scoring/query derivation treats it no
// differently than a real parsed resume) — it just skips PDF text
// extraction, since there's no real file behind it.
export const SAMPLE_RESUME_PROFILE: ResumeProfile = {
  yearsExperience: 8,
  seniority: 'Senior',
  industries: ['Marketing', 'Retail'],
  likelyRole: 'Marketing Manager',
  experience:
    '8 years of experience leading brand and demand-generation strategy for retail and consumer brands, with a focus on Marketing Strategy, Brand Management, and CRM.',
  skills: [
    { name: 'Marketing Strategy', category: 'business', demandLevel: 'high', proficiency: 76 },
    { name: 'Brand Management', category: 'business', demandLevel: 'high', proficiency: 77 },
    { name: 'CRM (Salesforce/HubSpot)', category: 'business', demandLevel: 'high', proficiency: 79 },
    { name: 'Content Writing', category: 'business', demandLevel: 'medium', proficiency: 81 },
    { name: 'SEO', category: 'business', demandLevel: 'medium', proficiency: 70 },
    { name: 'Market Research', category: 'business', demandLevel: 'medium', proficiency: 75 },
    { name: 'Stakeholder Management', category: 'business', demandLevel: 'high', proficiency: 77 },
    { name: 'Data Analysis', category: 'technical', demandLevel: 'very_high', proficiency: 68 },
    { name: 'Excel', category: 'business', demandLevel: 'very_high', proficiency: 88 },
  ],
};
