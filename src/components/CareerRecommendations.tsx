import React, { useState } from 'react';
import type { ResumeProfile, WorkModel, CareerRecommendation, JobOpportunity } from '../types';
import { getCareerRecommendations } from '../services/recommendationService';
import { calculateSkillGaps } from '../services/skillAnalysisService';
import { assessRemoteEligibility } from '../services/remoteEligibilityService';
import { jobsForCareerGuidance, type JobFetchSource } from '../services/jobService';
import { isSafeExternalUrl } from '../utils/urlSafety';
import { formatRelativePostedAt } from '../services/jobFreshness';
import { TrendingUp, Zap, Globe, Award, Sparkles } from 'lucide-react';

// Display names for NormalizedJob.source (providers/types.ts's JobSource) —
// duplicated here as a tiny display-only map rather than importing the
// provider-internal type, since this component only needs presentable
// text, not the type itself.
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  adzuna: 'Adzuna',
  arbeitnow: 'Arbeitnow',
  remotive: 'Remotive',
  jsearch: 'JSearch',
  himalayas: 'Himalayas',
};

interface CareerRecommendationsProps {
  profile: ResumeProfile;
  workModels: WorkModel[];
  onSendPrompt?: (text: string) => void;
  // Local and Remote each have their own independent search result, owned
  // by JobMatcherTab — a Local failure/empty result must never affect how
  // Remote renders, and vice versa, so they're passed in separately rather
  // than as one shared jobs/jobSource/jobReason triple.
  localJobs?: JobOpportunity[];
  localJobSource?: JobFetchSource;
  localJobReason?: string;
  localJobsLoading?: boolean;
  // Hybrid is geographically identical to Local (same destination
  // city/region requirement — see jobAggregatorService.ts), given its own
  // independent search/section for the same reason Local and Remote are
  // independent of each other.
  hybridJobs?: JobOpportunity[];
  hybridJobSource?: JobFetchSource;
  hybridJobReason?: string;
  hybridJobsLoading?: boolean;
  remoteJobs?: JobOpportunity[];
  remoteJobSource?: JobFetchSource;
  remoteJobReason?: string;
  remoteJobsLoading?: boolean;
  // Scrolls to the existing Tier 3 skill-analysis section (owned by
  // JobMatcherTab) — no new analysis or AI request, just navigation.
  onAnalyzeSkillGaps?: () => void;
  // Called when the user clicks "Explore Remote" from Local's empty-state
  // fallback below — adds 'remote' to JobMatcherTab's real workModels
  // state (the single source of truth every search effect keys off of),
  // so the existing Remote useEffect there actually runs and this
  // fallback can show genuine live results instead of relying on a Remote
  // search that was never triggered.
  onExploreRemote?: () => void;
  // The user's resolved relocation destination country name, used only to
  // compare a live Remote listing's own text against it for the
  // EOR/eligibility note below. Never used for scoring/matching.
  destinationCountryName?: string;
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
  localJobs,
  localJobSource,
  localJobReason,
  localJobsLoading,
  hybridJobs,
  hybridJobSource,
  hybridJobReason,
  hybridJobsLoading,
  remoteJobs,
  remoteJobSource,
  remoteJobReason,
  remoteJobsLoading,
  onAnalyzeSkillGaps,
  onExploreRemote,
  destinationCountryName,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Which alternative (if any) the user asked to see after Local came up
  // empty — null until they choose, so nothing is shown automatically.
  const [localFallbackChoice, setLocalFallbackChoice] = useState<'remote' | 'freelance' | null>(null);

  // Maps a CareerRecommendation back to the raw JobOpportunity it was built
  // from (getCareerRecommendations() summarizes id as `rec_${job.id}` and
  // drops the original description/timezone text) — needed only to look up
  // the listing's own eligibility-relevant text below, not for scoring.
  const jobById = new Map(
    [...(localJobs ?? []), ...(hybridJobs ?? []), ...(remoteJobs ?? [])].map((job) => [`rec_${job.id}`, job])
  );

  // Career guidance (the Remote section's cards) must keep working even
  // with zero/failed live results — jobsForCareerGuidance() supplies the
  // existing mock substrate in that case, exactly as getCareerRecommendations
  // already did via its own default before this change; it just now has to
  // be applied explicitly, since a genuinely empty live-result array (as
  // opposed to `undefined`) no longer triggers that fallback on its own.
  const remoteRecs = workModels.includes('remote')
    ? getCareerRecommendations(profile, { jobs: jobsForCareerGuidance(remoteJobs) })
    : [];

  // Local is destination-scoped and must NEVER show mock/fallback jobs
  // relabeled as local — only ever shown when the independent Local search
  // actually succeeded live. The "Remote " title prefix (added by
  // getCareerRecommendations) is stripped for display so a job is never
  // shown labelled Remote under the Local heading.
  const localRecs: CareerRecommendation[] =
    workModels.includes('local') && localJobSource === 'live' && localJobs && localJobs.length > 0
      ? getCareerRecommendations(profile, { jobs: localJobs, limit: 5 }).map((rec) => ({
          ...rec,
          workModel: 'local' as WorkModel,
          title: rec.title.replace(/^Remote\s+/i, ''),
        }))
      : [];

  // Hybrid mirrors Local exactly — same destination-scoped, live-only
  // gating, same title-prefix strip — it's an independent search with
  // identical geographic requirements (see jobAggregatorService.ts).
  const hybridRecs: CareerRecommendation[] =
    workModels.includes('hybrid') && hybridJobSource === 'live' && hybridJobs && hybridJobs.length > 0
      ? getCareerRecommendations(profile, { jobs: hybridJobs, limit: 5 }).map((rec) => ({
          ...rec,
          workModel: 'hybrid' as WorkModel,
          title: rec.title.replace(/^Remote\s+/i, ''),
        }))
      : [];

  // Local → Remote fallback: when Local has nothing suitable, offer the
  // independent Remote search's own live results as an alternative instead
  // of a dead end — never mock/fallback jobs relabeled as a "live" remote
  // suggestion.
  const remoteFallbackRecs: CareerRecommendation[] =
    workModels.includes('local') && localRecs.length === 0 && remoteJobSource === 'live' && remoteJobs && remoteJobs.length > 0
      ? getCareerRecommendations(profile, { jobs: remoteJobs })
      : [];

  // Freelance: Adzuna provides no reliable freelance/gig signal (contract_type
  // distinguishes permanent vs. contract employment, not freelance work —
  // see Step 6 diagnosis), and mock freelance data must not be presented as
  // real. Honest MVP state: always unavailable, never mock, never relabeled
  // remote/local jobs.
  const allRecs = [...remoteRecs, ...localRecs, ...hybridRecs];

  const handleAskAi = (rec: CareerRecommendation, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!onSendPrompt) return;

    const matched = rec.matchedSkills.map((skill) => skill.name).join(', ') || 'none of the listed skills yet';
    const missing = rec.missingSkills.map((skill) => skill.name).join(', ') || 'no major gaps';
    const experienceClause = profile.industries.length > 0 ? ` in ${profile.industries.join(', ')}` : '';
    // Only mention salary when the recommendation actually has one — omit
    // the clause entirely rather than inventing or placeholder-labeling it.
    const salaryClause = rec.salaryRange ? ` (${rec.salaryRange})` : '';

    const prompt = `I'm considering this ${rec.workModel} opportunity: "${rec.title}" at ${rec.company}${salaryClause}, a ${rec.matchScore}% match for my profile. I already have: ${matched}. I'm missing: ${missing}. Based on my ${profile.yearsExperience} years of experience${experienceClause}, can you explain: why this opportunity may fit my background, my strongest matching skills for it, any important gaps or concerns, and what I should consider before applying? Base your answer only on the facts I've given above — the match percentage and skill lists are already computed, so use them as-is rather than estimating your own, and don't invent skills, requirements, or other details I haven't mentioned.`;

    onSendPrompt(prompt);
  };

  const handleAnalyzeGap = (rec: CareerRecommendation, event: React.MouseEvent) => {
    event.stopPropagation();
    setExpandedId(rec.id);
    onAnalyzeSkillGaps?.();
  };

  const handleExplore = (rec: CareerRecommendation, event: React.MouseEvent) => {
    event.stopPropagation();
    setExpandedId(rec.id);
  };

  // kind: which independently-searched section this card came from.
  // 'local'/'hybrid' cards come from a destination-scoped query (where=city
  // or region; see JobMatcherTab.tsx/jobAggregatorService.ts), so their
  // location genuinely matches the user's resolved destination. 'remote'
  // cards (including Local's "explore remote instead" fallback) reuse that
  // canonical job list without any further location verification, so their
  // actual geographic eligibility for this user is not confirmed by our
  // data — hence the remote-eligibility note below only applies to them.
  const renderCard = (rec: CareerRecommendation, index: number, kind: 'local' | 'hybrid' | 'remote') => {
    const colors = getMatchColor(rec.matchScore);
    const isExpanded = expandedId === rec.id;
    const isVerifiedLocation = kind === 'local' || kind === 'hybrid';
    // Which independent search this specific card came from.
    const cardJobSource = kind === 'local' ? localJobSource : kind === 'hybrid' ? hybridJobSource : remoteJobSource;
    // Reuses the existing skillAnalysisService function directly — matchedSkills
    // + missingSkills together are exactly this opportunity's requiredSkills,
    // since recommendationService partitions them from the same source list.
    const skillGaps = calculateSkillGaps(profile.skills, [...rec.matchedSkills, ...rec.missingSkills]);

    // Remote eligibility/EOR note — only for genuinely live Remote listings
    // (never Local/Hybrid, which are already destination-verified via
    // their scoped queries; never mock/example data). Looked up from the
    // raw JobOpportunity this recommendation was built from, purely to
    // read its own title/description/location text — no scoring involved.
    const sourceJob = !isVerifiedLocation ? jobById.get(rec.id) : undefined;
    const eligibility =
      !isVerifiedLocation && cardJobSource === 'live' && sourceJob
        ? assessRemoteEligibility(sourceJob, destinationCountryName)
        : null;

    // Structured-signal counterpart to `eligibility` above — derived by
    // jobAggregatorService.ts from a provider's own country/eligibility
    // fields (see geoMatch.ts's classifyRemoteEligibility), not from
    // scanning this listing's own text. Shown only when the text-based
    // `eligibility` check above has nothing more specific to say
    // (null, or 'supported' — which renders no note at all today), so a
    // job with genuinely no eligibility signal from either source always
    // gets at least one honest, concise note rather than two overlapping
    // ones.
    const showUnclearEligibilityNote =
      !isVerifiedLocation &&
      cardJobSource === 'live' &&
      sourceJob?.remoteEligibilityStatus === 'unclear' &&
      (!eligibility || eligibility.status === 'supported');

    // Only ever render a real, absolute http(s) link — never trust
    // rec.applyUrl blindly as an href. See utils/urlSafety.ts.
    const safeApplyUrl = isSafeExternalUrl(rec.applyUrl) ? rec.applyUrl : undefined;

    // Subtle provider attribution + freshness — live jobs only (mock/
    // example recommendations have no real rec.source). A missing/
    // unparseable postedAt simply omits the freshness half rather than
    // claiming one — see jobFreshness.ts.
    const providerName = cardJobSource === 'live' && rec.source ? PROVIDER_DISPLAY_NAMES[rec.source] ?? rec.source : undefined;
    const postedLabel = cardJobSource === 'live' ? formatRelativePostedAt(rec.postedAt) : null;
    const attributionText = providerName
      ? postedLabel
        ? `Via ${providerName} · ${postedLabel}`
        : `Via ${providerName}`
      : null;

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
              {attributionText && (
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {attributionText}
                </p>
              )}
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
                  Skills to Develop (rough estimates)
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
              {cardJobSource !== 'live' ? (
                <p className="text-sm font-medium text-[var(--text-dark)]">Example opportunity — not a real listing.</p>
              ) : safeApplyUrl ? (
                <>
                  <a
                    href={safeApplyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="text-sm font-medium underline text-[var(--primary-dark)] hover:opacity-80"
                  >
                    {isVerifiedLocation ? 'View & Apply' : 'Check eligibility'}
                  </a>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    You may be applying before relocating — the employer or job source may apply its own location,
                    work-authorization, or regional restrictions. Verify eligibility directly on the listing.
                  </p>
                </>
              ) : (
                <p className="text-sm font-medium text-[var(--text-dark)]">Listing link unavailable.</p>
              )}
            </div>

            {eligibility && eligibility.status !== 'supported' && (
              <div className="p-3 bg-[var(--surface)] border border-[var(--border-warm)] rounded-lg">
                <p className="text-xs font-semibold text-[var(--text-light)] uppercase tracking-wider mb-1">
                  Remote Eligibility
                </p>
                <p className="text-sm text-[var(--text-dark)]">{eligibility.message}</p>
              </div>
            )}

            {showUnclearEligibilityNote && (
              <div className="p-3 bg-[var(--surface)] border border-[var(--border-warm)] rounded-lg">
                <p className="text-xs font-semibold text-[var(--text-light)] uppercase tracking-wider mb-1">
                  Remote Eligibility
                </p>
                <p className="text-sm text-[var(--text-dark)]">
                  Remote eligibility not specified — the listing doesn&rsquo;t say which countries it&rsquo;s open to.
                  Verify directly with the employer before applying.
                </p>
              </div>
            )}

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
            {remoteJobSource ? (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                style={
                  remoteJobSource === 'live'
                    ? { backgroundColor: 'var(--primary-light)', color: 'var(--primary-dark)' }
                    : { backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }
                }
                title={remoteJobSource !== 'live' ? remoteJobReason : undefined}
              >
                {remoteJobSource === 'live'
                  ? 'Live opportunities'
                  : remoteJobSource === 'empty'
                    ? 'Example opportunities — no live listings found'
                    : 'Example opportunities — live search unavailable'}
              </span>
            ) : (
              remoteJobsLoading && (
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}
                >
                  Finding live opportunities…
                </span>
              )
            )}
          </div>
          <div className="space-y-3">{remoteRecs.map((rec, index) => renderCard(rec, index, 'remote'))}</div>
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
          {localJobsLoading ? (
            <div className="rounded-md border p-5" style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}>
              <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>
                Finding live opportunities…
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                Checking current listings based on your profile, location, and work preferences.
              </p>
            </div>
          ) : localRecs.length > 0 ? (
            <div className="space-y-3">{localRecs.map((rec, index) => renderCard(rec, index, 'local'))}</div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border p-5" style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}>
                <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>
                  {localJobSource === 'error'
                    ? 'Live local search is temporarily unavailable.'
                    : 'No live opportunities found right now.'}
                </p>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                  {localJobSource === 'error'
                    ? localJobReason || 'The live job search could not be completed. You can still explore remote or freelance opportunities below.'
                    : 'Would you be interested in exploring remote or freelance opportunities instead?'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLocalFallbackChoice('remote');
                      // The display toggle above is not enough on its own
                      // (see onExploreRemote's own comment) — this is what
                      // actually makes the Remote search run.
                      onExploreRemote?.();
                    }}
                    aria-pressed={localFallbackChoice === 'remote'}
                    className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                    style={
                      localFallbackChoice === 'remote'
                        ? { borderColor: 'var(--primary-dark)', backgroundColor: 'var(--primary-light)', color: 'var(--primary-dark)' }
                        : { borderColor: 'var(--border-warm)', color: 'var(--text-body)' }
                    }
                  >
                    Explore Remote
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocalFallbackChoice('freelance')}
                    aria-pressed={localFallbackChoice === 'freelance'}
                    className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                    style={
                      localFallbackChoice === 'freelance'
                        ? { borderColor: 'var(--primary-dark)', backgroundColor: 'var(--primary-light)', color: 'var(--primary-dark)' }
                        : { borderColor: 'var(--border-warm)', color: 'var(--text-body)' }
                    }
                  >
                    Explore Freelance
                  </button>
                </div>
              </div>

              {localFallbackChoice === 'remote' && (
                remoteFallbackRecs.length > 0 ? (
                  <>
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary-dark)' }}
                    >
                      Live opportunities
                    </span>
                    <div className="space-y-3">{remoteFallbackRecs.map((rec, index) => renderCard(rec, index, 'remote'))}</div>
                  </>
                ) : (
                  <div className="rounded-md border p-5" style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}>
                    <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>
                      {remoteJobReason ||
                        (remoteJobSource === 'empty'
                          ? 'No live remote opportunities found right now.'
                          : 'Live remote search is currently unavailable.')}
                    </p>
                  </div>
                )
              )}

              {localFallbackChoice === 'freelance' && (
                <div className="rounded-md border p-5" style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}>
                  <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>
                    Freelance opportunities are currently unavailable.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {workModels.includes('hybrid') && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Hybrid
          </h3>
          {hybridJobsLoading ? (
            <div className="rounded-md border p-5" style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}>
              <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>
                Finding live opportunities…
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                Checking current listings based on your profile, location, and work preferences.
              </p>
            </div>
          ) : hybridRecs.length > 0 ? (
            <div className="space-y-3">{hybridRecs.map((rec, index) => renderCard(rec, index, 'hybrid'))}</div>
          ) : (
            <div className="rounded-md border p-5" style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}>
              <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>
                {hybridJobSource === 'error'
                  ? 'Live hybrid search is temporarily unavailable.'
                  : 'No live opportunities found right now.'}
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                {hybridJobSource === 'error'
                  ? hybridJobReason || 'The live job search could not be completed.'
                  : 'Try Local or Remote to see other opportunities.'}
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
