import React, { useEffect, useState } from 'react';
import type { ResumeProfile, WorkModel } from '../types';
import ResumeUploader from './ResumeUploader';
import CareerProfile from './CareerProfile';
import CareerRecommendations from './CareerRecommendations';
import SkillAnalysis from './SkillAnalysis';
import WorkModelSelector from './WorkModelSelector';
import { resolveDestination, isAdzunaSupportedCountry } from '../services/locationService';
import { deriveJobQuery } from '../services/jobQueryService';
import { loadJobOpportunities, type JobFetchResult } from '../services/jobService';

interface JobMatcherTabProps {
  onProfileParsed?: (profile: ResumeProfile) => void;
  onSendPrompt?: (text: string) => void;
  // Optional for now — App.tsx does not pass this yet (threading the
  // relocation destination down from App.tsx is a separate, not-yet-scoped
  // change). When absent, the job fetch below correctly and honestly falls
  // back to mock jobs, since there is no location to search Adzuna against.
  destination?: string;
}

const JobMatcherTab: React.FC<JobMatcherTabProps> = ({ onProfileParsed, onSendPrompt, destination }) => {
  const [parsedProfile, setParsedProfile] = useState<ResumeProfile | null>(null);
  const [workModels, setWorkModels] = useState<WorkModel[]>([]);
  // The single canonical job-fetch result for this screen. Not yet consumed
  // by any child component — a later step wires this into
  // CareerRecommendations and SkillAnalysis so both always agree.
  const [jobResult, setJobResult] = useState<JobFetchResult | null>(null);
  const [jobsLoading, setJobsLoading] = useState(false);

  const handleProfileParsed = (profile: ResumeProfile) => {
    setParsedProfile(profile);
    onProfileParsed?.(profile);
  };

  const handleReset = () => {
    setParsedProfile(null);
    setWorkModels([]);
    setJobResult(null);
  };

  // The ONE job fetch for this screen, owned here. Triggered once a profile
  // exists and the user has chosen a work model — the same point the
  // results view below renders. Resolves the destination, derives a
  // profile-driven search query (never a hard-coded title), and loads
  // live-or-fallback jobs via the single canonical pipeline.
  useEffect(() => {
    if (!parsedProfile || workModels.length === 0) {
      setJobResult(null);
      return;
    }

    let cancelled = false;

    const loadJobs = async () => {
      setJobsLoading(true);

      const location = await resolveDestination(destination ?? '');
      if (cancelled) return;

      const query = deriveJobQuery(parsedProfile);

      let result: JobFetchResult;
      if (location.countryCode && !location.isRemote && isAdzunaSupportedCountry(location.countryCode)) {
        result = await loadJobOpportunities({
          what: query.primaryQuery,
          where: location.city,
          country: location.countryCode,
        });
      } else {
        // No resolved/supported country yet (unresolved, ambiguous, remote,
        // or outside Adzuna's coverage) — skip the live call rather than
        // make a request already known to be rejected; loadJobOpportunities
        // still returns the correctly tagged fallback result.
        result = await loadJobOpportunities({ what: query.primaryQuery });
      }

      if (!cancelled) {
        setJobResult(result);
        setJobsLoading(false);
      }
    };

    loadJobs();

    return () => {
      cancelled = true;
    };
  }, [parsedProfile, workModels, destination]);

  // Temporary verification aid for this step — Steps 7-9 will replace this
  // with real consumption (props into CareerRecommendations/SkillAnalysis,
  // plus the live/mock UI label). Confirms the single fetch is happening
  // and what it produced, without rendering anything yet.
  useEffect(() => {
    if (jobsLoading) {
      console.debug('[JobMatcherTab] loading job opportunities…');
    } else if (jobResult) {
      console.debug(
        `[JobMatcherTab] job fetch complete — source: ${jobResult.source}, jobs: ${jobResult.jobs.length}` +
          (jobResult.reason ? `, reason: ${jobResult.reason}` : '')
      );
    }
  }, [jobResult, jobsLoading]);

  return (
    <div className="space-y-8 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-gold)' }}>
          Career &amp; Income
        </p>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          Compare local, remote, and freelance paths — grounded in your actual profile.
        </p>
      </div>

      {/* Upload Resume */}
      {!parsedProfile && (
        <div className="rounded-lg border p-6" style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}>
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-strong)' }}>
            Upload Your Resume
          </h3>
          <ResumeUploader onParsed={handleProfileParsed} />
        </div>
      )}

      {/* Work model preference — collected once per resume, before results */}
      {parsedProfile && workModels.length === 0 && <WorkModelSelector onContinue={setWorkModels} />}

      {parsedProfile && workModels.length > 0 && (
        <>
          {/* Tier 1 — hero: overall career profile */}
          <section>
            <CareerProfile profile={parsedProfile} />
          </section>

          {/* Tier 2 — recommended paths, filtered by work model preference */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
                Recommended Paths
              </h3>
              <button
                onClick={() => setWorkModels([])}
                className="text-xs font-medium underline"
                style={{ color: 'var(--text-muted)' }}
              >
                Change work preferences
              </button>
            </div>
            <CareerRecommendations
              profile={parsedProfile}
              workModels={workModels}
              onSendPrompt={onSendPrompt}
              jobs={jobResult?.jobs}
              jobSource={jobResult?.source}
              jobReason={jobResult?.reason}
            />
          </section>

          {/* Tier 3 — skill gap detail */}
          <section
            className="rounded-lg border p-2 sm:p-4"
            style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface-2)' }}
          >
            <SkillAnalysis
              profile={parsedProfile}
              jobs={jobResult?.jobs}
              jobSource={jobResult?.source}
              jobReason={jobResult?.reason}
            />
          </section>

          <button
            onClick={handleReset}
            className="rounded-md px-4 py-2 text-sm font-medium transition-colors"
            style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-strong)' }}
          >
            Upload Different Resume
          </button>
        </>
      )}
    </div>
  );
};

export default JobMatcherTab;
