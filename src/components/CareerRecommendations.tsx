import React, { useState } from 'react';
import type { ResumeProfile, WorkModel, CareerRecommendation, JobOpportunity } from '../types';
import { getCareerRecommendations } from '../services/recommendationService';
import { calculateSkillGaps } from '../services/skillAnalysisService';
import { TrendingUp, Zap, Globe, Award, Sparkles } from 'lucide-react';

interface CareerRecommendationsProps {
  profile: ResumeProfile;
  workModels: WorkModel[];
  onSendPrompt?: (text: string) => void;
  // The canonical job-fetch result owned by JobMatcherTab (live Adzuna
  // jobs, or the tagged mock fallback — never a mix of both). Optional so
  // this component still works if a parent hasn't wired it in yet —
  // getCareerRecommendations() falls back to its own mock default in that
  // case, exactly as it already did before this change.
  jobs?: JobOpportunity[];
  // Whether `jobs` above is live Adzuna data or the mock fallback — drives
  // the "Live opportunities" / "Example opportunities" label on the Remote
  // section, which is the only section these jobs actually feed.
  jobSource?: 'live' | 'fallback';
  jobReason?: string;
}

function getMatchColor(score: number) {
  if (score >= 80) return { accent: 'var(--status-success)', badge: 'bg-green-100 text-green-800' };
  if (score >= 60) return { accent: 'var(--status-warning)', badge: 'bg-yellow-100 text-yellow-800' };
  return { accent: 'var(--status-danger)', badge: 'bg-red-100 text-red-800' };
}

const CareerRecommendations: React.FC<CareerRecommendationsProps> = ({
  profile,
  workModels,
  onSendPrompt,
  jobs,
  jobSource,
  jobReason,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const remoteRecs = workModels.includes('remote')
    ? getCareerRecommendations(profile, jobs ? { jobs } : undefined)
    : [];

  // Local reuses the SAME canonical, destination-scoped search — the
  // fetch JobMatcherTab already runs is scoped to the resolved destination
  // city/country, so there's no separate "local" API call to make. Only
  // ever shown when that fetch actually succeeded live (never mock/
  // fallback jobs relabeled as local), and the "Remote " title prefix
  // (added by getCareerRecommendations) is stripped for display so a job
  // is never shown labelled Remote under the Local heading.
  const localRecs: CareerRecommendation[] =
    workModels.includes('local') && jobSource === 'live' && jobs && jobs.length > 0
      ? getCareerRecommendations(profile, { jobs, limit: 5 }).map((rec) => ({
          ...rec,
          workModel: 'local' as WorkModel,
          title: rec.title.replace(/^Remote\s+/i, ''),
        }))
      : [];

  // Freelance: Adzuna provides no reliable freelance/gig signal (contract_type
  // distinguishes permanent vs. contract employment, not freelance work —
  // see Step 6 diagnosis), and mock freelance data must not be presented as
  // real. Honest MVP state: always unavailable, never mock, never relabeled
  // remote/local jobs.
  const allRecs = [...remoteRecs, ...localRecs];

  const handleAskAi = (rec: CareerRecommendation, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!onSendPrompt) return;

    const matched = rec.matchedSkills.map((skill) => skill.name).join(', ') || 'none of the listed skills yet';
    const missing = rec.missingSkills.map((skill) => skill.name).join(', ') || 'no major gaps';
    const experienceClause = profile.industries.length > 0 ? ` in ${profile.industries.join(', ')}` : '';
    // Only mention salary when the recommendation actually has one — omit
    // the clause entirely rather than inventing or placeholder-labeling it.
    const salaryClause = rec.salaryRange ? ` (${rec.salaryRange})` : '';

    const prompt = `I'm considering this ${rec.workModel} opportunity: "${rec.title}" at ${rec.company}${salaryClause}, a ${rec.matchScore}% match for my profile. I already have: ${matched}. I'm missing: ${missing}. Based on my ${profile.yearsExperience} years of experience${experienceClause}, can you explain: why this opportunity may fit my background, my strongest matching skills for it, any important gaps or concerns, and what I should consider before applying?`;

    onSendPrompt(prompt);
  };

  const handleAnalyzeGap = (rec: CareerRecommendation, event: React.MouseEvent) => {
    event.stopPropagation();
    setExpandedId(rec.id);
  };

  const handleExplore = (rec: CareerRecommendation, event: React.MouseEvent) => {
    event.stopPropagation();
    setExpandedId(rec.id);
  };

  const renderCard = (rec: CareerRecommendation, index: number) => {
    const colors = getMatchColor(rec.matchScore);
    const isExpanded = expandedId === rec.id;
    // Reuses the existing skillAnalysisService function directly — matchedSkills
    // + missingSkills together are exactly this opportunity's requiredSkills,
    // since recommendationService partitions them from the same source list.
    const skillGaps = calculateSkillGaps(profile.skills, [...rec.matchedSkills, ...rec.missingSkills]);

    return (
      <div
        key={rec.id}
        className="animate-slide-in group transition-all duration-300 border rounded-lg overflow-hidden cursor-pointer hover:shadow-card"
        style={{ backgroundColor: 'var(--surface)', borderColor: colors.accent, animationDelay: `${index * 50}ms` }}
        onClick={() => setExpandedId(isExpanded ? null : rec.id)}
      >
        <div className="p-4">
          <div className="flex items-start justify-between mb-1">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-[var(--text-dark)] mb-0.5">{rec.title}</h3>
              <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                {rec.company}
              </p>
            </div>
            <div className={`px-3 py-1.5 rounded-full text-sm font-bold ${colors.badge} whitespace-nowrap ml-3`}>
              {rec.matchScore}%
            </div>
          </div>

          <p className="mt-2 text-sm text-[var(--text-light)]">{rec.reason}</p>

          <div className="flex gap-4 mt-3 mb-1 text-sm">
            <div className="flex items-center gap-1">
              <Globe size={14} className="text-[var(--primary-dark)]" />
              <span className="text-[var(--text-light)]">{rec.opportunityCount}+ roles</span>
            </div>
            <div className="flex items-center gap-1">
              <Award size={14} className="text-[var(--primary-dark)]" />
              <span className="text-[var(--text-light)]">{rec.salaryRange || 'Salary data unavailable'}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            {rec.matchedSkills.slice(0, 3).map((skill) => (
              <span
                key={skill.name}
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200"
              >
                ✓ {skill.name}
              </span>
            ))}
            {rec.matchedSkills.length > 3 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--bg-light)] text-[var(--text-dark)] border border-[var(--border-light)]">
                +{rec.matchedSkills.length - 3}
              </span>
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="border-t border-current/10 p-4 bg-[var(--surface-2)] space-y-4 animate-slide-in">
            {skillGaps.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[var(--text-light)] uppercase mb-2 tracking-wider">
                  Skills to Develop
                </p>
                <div className="flex flex-wrap gap-2">
                  {skillGaps.map((gap) => (
                    <span
                      key={gap.skill.name}
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200"
                    >
                      ◯ {gap.skill.name} (~{gap.estimatedTimeWeeks} {gap.estimatedTimeWeeks === 1 ? 'wk' : 'wks'})
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="p-3 bg-[#26c485]/10 border border-[#26c485]/30 rounded-lg">
              <p className="text-xs font-semibold text-[var(--primary-dark)] uppercase tracking-wider mb-1">Next Step</p>
              <p className="text-sm font-medium text-[var(--text-dark)]">{rec.recommendedAction}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
              <button
                onClick={(event) => handleExplore(rec, event)}
                className="px-3 py-2 rounded-lg bg-[#26c485] text-white text-xs font-medium transition-all hover:bg-[#1a8b5a] active:scale-95"
              >
                Explore
              </button>
              <button
                onClick={(event) => handleAnalyzeGap(rec, event)}
                className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--primary-dark)] text-[var(--primary-dark)] text-xs font-medium transition-all hover:bg-[#26c485]/5 active:scale-95"
              >
                Analyze Skill Gap
              </button>
              <button
                onClick={(event) => handleAskAi(rec, event)}
                disabled={!onSendPrompt}
                className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--primary-dark)] text-[var(--primary-dark)] text-xs font-medium transition-all hover:bg-[#26c485]/5 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Sparkles size={12} aria-hidden="true" />
                Ask AI
              </button>
            </div>
          </div>
        )}

        {!isExpanded && (
          <div className="px-4 py-2 bg-[var(--surface-2)] border-t border-current/10 flex items-center justify-center text-xs text-[var(--text-light)] group-hover:text-[var(--text-dark)]">
            Click to expand
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Clearly non-functional — matches + explains + compares today; does not recommend yet */}
      <div className="rounded-md border border-dashed p-4" style={{ borderColor: 'var(--border-warm)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Personalized Work Recommendation
        </p>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-body)' }}>
          Coming soon — PivotPartner will compare career fit, income potential, work feasibility and flexibility to
          recommend the strongest path for your move.
        </p>
      </div>

      {allRecs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-[#26c485]/10 to-[#26c485]/5 rounded-lg p-4 border border-[#26c485]/20">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={16} className="text-[var(--primary-dark)]" />
              <span className="text-xs font-semibold text-[var(--text-light)] uppercase">Avg Match</span>
            </div>
            <p className="text-2xl font-bold text-[var(--primary-dark)]">
              {Math.round(allRecs.reduce((sum, r) => sum + r.matchScore, 0) / allRecs.length)}%
            </p>
          </div>
          <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 rounded-lg p-4 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Award size={16} className="text-blue-600" />
              <span className="text-xs font-semibold text-[var(--text-light)] uppercase">Opportunities</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">
              {allRecs.reduce((sum, r) => sum + r.opportunityCount, 0)}+
            </p>
          </div>
          <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 rounded-lg p-4 border border-purple-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Zap size={16} className="text-purple-600" />
              <span className="text-xs font-semibold text-[var(--text-light)] uppercase">Matches</span>
            </div>
            <p className="text-2xl font-bold text-purple-600">{allRecs.length}</p>
          </div>
        </div>
      )}

      {workModels.includes('remote') && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Remote
            </h3>
            {jobSource && (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                style={
                  jobSource === 'live'
                    ? { backgroundColor: 'var(--primary-light)', color: 'var(--primary-dark)' }
                    : { backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }
                }
                title={jobSource === 'fallback' ? jobReason : undefined}
              >
                {jobSource === 'live' ? 'Live opportunities' : 'Example opportunities — live search unavailable'}
              </span>
            )}
          </div>
          <div className="space-y-3">{remoteRecs.map(renderCard)}</div>
        </section>
      )}

      {workModels.includes('freelance') && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Freelance &amp; Consulting
          </h3>
          <div className="rounded-md border p-5" style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}>
            <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>
              Freelance opportunities are currently unavailable.
            </p>
          </div>
        </section>
      )}

      {workModels.includes('local') && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Local
          </h3>
          {localRecs.length > 0 ? (
            <div className="space-y-3">{localRecs.map(renderCard)}</div>
          ) : (
            <div className="rounded-md border p-5" style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}>
              <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>
                Local opportunities are currently unavailable.
              </p>
            </div>
          )}
        </section>
      )}

      {allRecs.length > 0 && (
        <div className="mt-6 p-4 bg-[#26c485]/5 border border-[#26c485]/20 rounded-lg text-center">
          <p className="text-sm text-[var(--text-light)]">
            💡 <span className="font-medium">Tip:</span> Click any recommendation to see skills to develop and next steps
          </p>
        </div>
      )}
    </div>
  );
};

export default CareerRecommendations;
