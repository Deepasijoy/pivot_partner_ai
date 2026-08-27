import React from 'react';
import type { ResumeProfile, JobOpportunity } from '../types';
import { getCareerRecommendations, deriveSeniority, splitSkillsByTransferability } from '../services/recommendationService';

interface CareerProfileProps {
  profile: ResumeProfile;
  // The canonical job-fetch result (live Adzuna jobs, or the tagged mock
  // fallback) — same data CareerRecommendations/SkillAnalysis already use,
  // so "Suggested Role"/"Market Fit" reflects the same dataset instead of
  // silently defaulting to mock jobs. Optional so this still works if a
  // parent hasn't wired it in yet — getCareerRecommendations() falls back
  // to its own mock default in that case, exactly as it already did before.
  jobs?: JobOpportunity[];
  jobSource?: 'live' | 'fallback';
  jobReason?: string;
}

function getFitColor(score: number): string {
  if (score >= 80) return 'var(--primary)';
  if (score >= 60) return '#F59E0B';
  return '#EF4444';
}

const CareerProfile: React.FC<CareerProfileProps> = ({ profile, jobs, jobSource, jobReason }) => {
  const [topRecommendation] = getCareerRecommendations(profile, jobs ? { jobs, limit: 1 } : { limit: 1 });
  const { coreSkills, transferableSkills } = splitSkillsByTransferability(profile.skills);
  const seniority = deriveSeniority(profile.yearsExperience);
  const marketFit = topRecommendation?.matchScore ?? 0;
  const fitColor = getFitColor(marketFit);

  return (
    <div className="w-full max-w-4xl mx-auto rounded-xl bg-[var(--surface)] shadow-md border border-[var(--border-warm)] overflow-hidden">
      <div className="bg-[#26c485] px-6 py-5 sm:px-8 sm:py-6">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-white/80">Suggested Role</p>
          {jobSource && (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-white/20 text-white"
              title={jobSource === 'fallback' ? jobReason : undefined}
            >
              {jobSource === 'live' ? 'Live opportunities' : 'Example opportunities — live search unavailable'}
            </span>
          )}
        </div>
        <h2 className="mt-1 text-2xl font-semibold text-white">
          {topRecommendation?.title ?? 'Building your profile…'}
        </h2>
      </div>

      <div className="p-6 sm:p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs font-medium text-[var(--text-light)] uppercase">Experience</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text-dark)]">{profile.yearsExperience} yrs</p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--text-light)] uppercase">Seniority</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text-dark)]">{seniority}</p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="text-xs font-medium text-[var(--text-light)] uppercase">Market Fit</p>
            <p className="mt-1 text-lg font-semibold" style={{ color: fitColor }}>
              {marketFit}%
            </p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="text-xs font-medium text-[var(--text-light)] uppercase">Industries</p>
            <p className="mt-1 text-sm font-medium text-[var(--text-dark)]">
              {profile.industries.length > 0 ? profile.industries.join(', ') : 'General Business'}
            </p>
          </div>
        </div>

        <div className="h-2 w-full rounded-full bg-[var(--bg-light)]">
          <div
            className="h-2 rounded-full transition-all"
            style={{ width: `${Math.min(100, Math.max(0, marketFit))}%`, backgroundColor: fitColor }}
          />
        </div>
        <p className="text-xs text-[var(--text-light)]">
          Reflects overall profile fit for this role — skills, experience, and industry/transferable-skill alignment
          combined. The Career Paths percentages further down use a different, narrower calculation (skill overlap
          with that specific opportunity only), so the two numbers can legitimately differ.
        </p>

        <div>
          <p className="text-sm font-semibold text-[var(--text-dark)] mb-2">Core Skills</p>
          <div className="flex flex-wrap gap-2">
            {coreSkills.map((skill) => (
              <span
                key={skill.name}
                className="rounded-full bg-[var(--primary-light)] px-3 py-1 text-xs font-medium text-[var(--primary-dark)]"
              >
                {skill.name}
              </span>
            ))}
            {coreSkills.length === 0 && (
              <p className="text-sm text-[var(--text-light)]">No core technical skills detected.</p>
            )}
          </div>
        </div>

        {transferableSkills.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-[var(--text-dark)] mb-2">Transferable Skills</p>
            <div className="flex flex-wrap gap-2">
              {transferableSkills.map((skill) => (
                <span
                  key={skill.name}
                  className="rounded-full bg-[var(--bg-light)] px-3 py-1 text-xs font-medium text-[var(--text-dark)]"
                >
                  {skill.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CareerProfile;
