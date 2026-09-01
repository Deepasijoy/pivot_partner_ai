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

// Short, non-technical framing for occupationMatchingService.ts's category
// tag — gives the AI grounded language for the occupation/domain
// relationship instead of it having to characterize the transition itself.
function describeOccupationFit(category: string | undefined): string {
  switch (category) {
    case 'same_domain':
      return 'closely matches the candidate\'s stated occupation/domain';
    case 'adjacent':
      return 'a plausible transition from the candidate\'s stated occupation/domain';
    case 'unrelated':
      return 'outside the candidate\'s stated occupation/domain';
    default:
      return 'occupation fit not determined from available evidence';
  }
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
  const evidenceRuleLines: string[] = [];
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
      const fitNote = describeOccupationFit(rec.occupationCategory);
      jobLines.push(
        `${rec.title} at ${rec.company} — ${rec.matchScore}% match (already computed by the app; ${fitNote}), salary ${
          rec.salaryRange || 'not listed'
        }, has: ${matched}, gaps: ${missing}`
      );
    }

    const matchedJobs = matchJobsForUser(profile, guidanceJobs);
    const paths = generateCareerPaths(profile.skills, matchedJobs, profile.likelyRole, profile.industries).slice(0, 2);
    for (const path of paths) {
      const gaps = path.skillGaps.map((gap) => gap.skill.name).join(', ') || 'none';
      const fitNote = describeOccupationFit(path.occupationCategory);
      jobLines.push(`Career path "${path.title}": ${path.matchPercentage}% fit (already computed by the app; ${fitNote}), skill gaps: ${gaps}`);
    }

    // Only meaningful once there's real recommendation/path evidence above
    // to ground against — keeps this instructional block out of contexts
    // that have nothing for it to apply to.
    if (recommendations.length > 0 || paths.length > 0) {
      evidenceRuleLines.push(
        'Every match percentage, matched skill, missing skill, salary figure, and occupation-fit note above is already computed by the application — use them exactly as given.',
        'Do not calculate or state a different match percentage than the one given.',
        'Do not say the candidate has a skill that is not listed under "has:" for that item.',
        'Do not say a job or career path requires a skill that is not listed under "gaps:" for that item.',
        'When recommending a course, name only a course already present in the app\'s Recommended Courses section — never invent a course title, platform, price, duration, or certification.',
        'If something is not covered by the evidence above (e.g. a specific employer\'s interview process, or a salary/skill not listed), say that information is not available rather than guessing.'
      );
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
    section('JOB DATA EVIDENCE RULES', evidenceRuleLines),
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
