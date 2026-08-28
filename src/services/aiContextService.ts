import type { PreferredWorkModel, ResumeProfile, WorkModel } from '../types';
import type { JobFetchResult } from './jobService';
import { jobsForCareerGuidance } from './jobService';
import { getCareerRecommendations } from './recommendationService';
import { generateCareerPaths, matchJobsForUser } from './matchingService';

// Builds the structured context handed to Groq alongside the user's
// message, so the AI copilot uses what PivotPartner already knows instead
// of re-asking for it. Reuses the existing, unmodified scoring functions
// (getCareerRecommendations, matchJobsForUser, generateCareerPaths) — this
// never computes a new score or invents job data; it summarizes the same
// canonical opportunities/scores already shown in Career & Income.

export interface AiContextInput {
  origin: string;
  destination: string;
  moveTiming: string;
  workSituation: string;
  preferredWorkModel: PreferredWorkModel | '';
  profile: ResumeProfile | null;
  careerJobs: JobFetchResult | null;
  careerWorkModels: WorkModel[];
}

function section(title: string, lines: string[]): string {
  if (lines.length === 0) return '';
  return `${title}:\n${lines.map((line) => `- ${line}`).join('\n')}`;
}

export function buildAiContext(input: AiContextInput): string {
  const { origin, destination, moveTiming, workSituation, preferredWorkModel, profile, careerJobs, careerWorkModels } =
    input;

  const relocationLines: string[] = [];
  if (origin.trim()) relocationLines.push(`Origin: ${origin.trim()}`);
  if (destination.trim()) relocationLines.push(`Destination: ${destination.trim()}`);
  if (moveTiming.trim()) relocationLines.push(`Move timing: ${moveTiming.trim()}`);
  if (workSituation.trim()) relocationLines.push(`Current work situation: ${workSituation.trim()}`);

  const careerLines: string[] = [];
  if (profile) {
    if (profile.likelyRole) careerLines.push(`Likely role: ${profile.likelyRole}`);
    if (profile.seniority) careerLines.push(`Seniority: ${profile.seniority}`);
    if (profile.industries.length > 0) careerLines.push(`Industry: ${profile.industries.join(', ')}`);
    if (profile.skills.length > 0) careerLines.push(`Skills: ${profile.skills.map((skill) => skill.name).join(', ')}`);
    careerLines.push(`Years of experience: ${profile.yearsExperience}`);
    if (profile.experience) careerLines.push(`Experience summary: ${profile.experience}`);
  }

  const workModelLines: string[] = [];
  if (preferredWorkModel) workModelLines.push(`Stated preference: ${preferredWorkModel}`);
  if (careerWorkModels.length > 0) workModelLines.push(`Selected in Career & Income: ${careerWorkModels.join(', ')}`);

  const jobLines: string[] = [];
  if (profile && careerJobs) {
    const sourceLabel =
      careerJobs.source === 'live'
        ? 'LIVE — these are real, currently available opportunities.'
        : careerJobs.source === 'empty'
          ? `EXAMPLE/SAMPLE — the live search completed but found no matching listings${
              careerJobs.reason ? ` (${careerJobs.reason})` : ''
            }. These are illustrative only. Do NOT present them as real, currently open vacancies.`
          : `EXAMPLE/SAMPLE — live job search is currently unavailable${
              careerJobs.reason ? ` (${careerJobs.reason})` : ''
            }. These are illustrative only. Do NOT present them as real, currently open vacancies.`;
    jobLines.push(`Source: ${sourceLabel}`);

    const guidanceJobs = jobsForCareerGuidance(careerJobs.jobs);
    const recommendations = getCareerRecommendations(profile, { jobs: guidanceJobs, limit: 3 });
    for (const rec of recommendations) {
      const matched = rec.matchedSkills.map((skill) => skill.name).join(', ') || 'none yet';
      const missing = rec.missingSkills.map((skill) => skill.name).join(', ') || 'no major gaps';
      jobLines.push(
        `${rec.title} at ${rec.company} — ${rec.matchScore}% match, salary ${
          rec.salaryRange || 'not listed'
        }, has: ${matched}, gaps: ${missing}`
      );
    }

    const matchedJobs = matchJobsForUser(profile.skills, guidanceJobs);
    const paths = generateCareerPaths(profile.skills, matchedJobs).slice(0, 2);
    for (const path of paths) {
      const gaps = path.skillGaps.map((gap) => gap.skill.name).join(', ') || 'none';
      jobLines.push(`Career path "${path.title}": ${path.matchPercentage}% fit, skill gaps: ${gaps}`);
    }
  }

  const pillarLines = [
    'Documents, Tax, Housing, Life Setup, and Community are not yet implemented in PivotPartner — no data is available for them. Do not invent or assume information for these areas.',
  ];

  const sections = [
    section('RELOCATION', relocationLines),
    section('CAREER PROFILE', careerLines),
    section('WORK MODEL', workModelLines),
    section('JOB DATA', jobLines),
    section('OTHER PILLARS', pillarLines),
  ].filter((block) => block.length > 0);

  if (sections.length === 0) return '';

  return (
    'The user has already provided the following information to PivotPartner. ' +
    'Use it directly — do not ask the user to repeat anything listed here. ' +
    'Only ask about information that is genuinely missing.\n\n' +
    sections.join('\n\n')
  );
}
