import React, { useEffect, useRef, useState } from 'react';
import type { ResumeProfile, WorkModel } from '../types';
import ResumeUploader from './ResumeUploader';
import CareerProfile from './CareerProfile';
import CareerRecommendations from './CareerRecommendations';
import SkillAnalysis from './SkillAnalysis';
import WorkModelSelector from './WorkModelSelector';
import { resolveDestination, isAdzunaSupportedCountry, type ResolvedLocation } from '../services/locationService';
import { deriveJobQuery } from '../services/jobQueryService';
import { loadJobOpportunities, errorResult, type JobFetchResult } from '../services/jobService';

interface JobMatcherTabProps {
  onProfileParsed?: (profile: ResumeProfile) => void;
  onSendPrompt?: (text: string) => void;
  destination?: string;
  // Reports the canonical job-fetch result (and the work models it was
  // computed for) up to App.tsx, purely so it can be included in AI
  // context — mirrors the existing onProfileParsed pattern. Does not add
  // a second fetch or any new scoring; App.tsx only ever receives the
  // same result already passed to CareerRecommendations/SkillAnalysis.
  onJobsResolved?: (result: JobFetchResult, workModels: WorkModel[]) => void;
  // The actual scrollable element for this tab's content (App.tsx's
  // overflow-y-auto pillar-content div). Used by "Analyze Skill Gap" to
  // scroll directly via scrollTo/scrollTop — scrollIntoView() alone doesn't
  // reliably reach through the overflow-hidden flex wrappers around it.
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

const JobMatcherTab: React.FC<JobMatcherTabProps> = ({
  onProfileParsed,
  onSendPrompt,
  destination,
  onJobsResolved,
  scrollContainerRef,
}) => {
  const [parsedProfile, setParsedProfile] = useState<ResumeProfile | null>(null);
  const [workModels, setWorkModels] = useState<WorkModel[]>([]);

  // Local and Remote each get their own independent search state, so a
  // Local result (empty, error, whatever) can never affect Remote's, and
  // vice versa. Each is only fetched while its work model is selected.
  // Freelance has no live data source at all (see CareerRecommendations.tsx
  // — Adzuna has no reliable freelance signal), so it needs no fetch state
  // here; its section already renders independently of any of this.
  const [localJobResult, setLocalJobResult] = useState<JobFetchResult | null>(null);
  const [localJobsLoading, setLocalJobsLoading] = useState(false);
  const [remoteJobResult, setRemoteJobResult] = useState<JobFetchResult | null>(null);
  const [remoteJobsLoading, setRemoteJobsLoading] = useState(false);

  // Destination resolution (geocoding) is shared — where someone is moving
  // to doesn't depend on which work models they picked, so this runs once
  // and both searches below reuse it rather than each geocoding separately.
  const [resolvedLocation, setResolvedLocation] = useState<ResolvedLocation | null>(null);

  // The single "best" result for consumers that only want one overall
  // picture (CareerProfile's hero, SkillAnalysis's scoring, and the
  // existing onJobsResolved AI-context callback) rather than a Local-vs-
  // Remote breakdown — prefers live data from either search.
  const primaryJobResult: JobFetchResult | null =
    localJobResult?.source === 'live'
      ? localJobResult
      : remoteJobResult?.source === 'live'
        ? remoteJobResult
        : localJobResult ?? remoteJobResult ?? null;

  // Lets "Analyze Skill Gap" (in CareerRecommendations) scroll the user down
  // to the existing Tier 3 skill-analysis section below, instead of
  // triggering any new analysis or AI request.
  const skillAnalysisRef = useRef<HTMLDivElement>(null);
  const scrollToSkillAnalysis = () => {
    const target = skillAnalysisRef.current;
    if (!target) return;

    const container = scrollContainerRef?.current;
    if (!container) {
      // No container ref available (e.g. a caller that doesn't pass one) —
      // fall back to the browser's own ancestor-scrolling behavior.
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // Compute the target's offset within the container directly and scroll
    // the container itself. scrollIntoView() asks the browser to walk up
    // and scroll whichever ancestor scrolling boxes it thinks are needed —
    // in this layout, the intermediate flex wrappers around the container
    // are `overflow-hidden`, which also count as scrolling boxes, and in
    // testing the browser did not end up moving the actual overflow-y-auto
    // container's scrollTop. Scrolling that container explicitly sidesteps
    // the ambiguity.
    const offsetWithinContainer =
      target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;

    container.scrollTo({ top: offsetWithinContainer, behavior: 'smooth' });
  };

  const handleProfileParsed = (profile: ResumeProfile) => {
    setParsedProfile(profile);
    onProfileParsed?.(profile);
  };

  const handleReset = () => {
    setParsedProfile(null);
    setWorkModels([]);
    setLocalJobResult(null);
    setRemoteJobResult(null);
    setResolvedLocation(null);
  };

  // Resolve the destination once, shared by both searches below.
  useEffect(() => {
    if (!parsedProfile || workModels.length === 0) {
      setResolvedLocation(null);
      return;
    }

    let cancelled = false;

    resolveDestination(destination ?? '').then((location) => {
      if (!cancelled) setResolvedLocation(location);
    });

    return () => {
      cancelled = true;
    };
  }, [parsedProfile, workModels, destination]);

  // LOCAL search — independent of Remote. Only attempted while 'local' is
  // selected. Scoped to the resolved destination city/region + country, so
  // results genuinely match where the user is relocating to (unchanged
  // query shape from before this fix).
  useEffect(() => {
    if (!parsedProfile || !workModels.includes('local') || !resolvedLocation) {
      setLocalJobResult(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLocalJobsLoading(true);

      const query = deriveJobQuery(parsedProfile);
      let result: JobFetchResult;

      if (
        resolvedLocation.countryCode &&
        !resolvedLocation.isRemote &&
        isAdzunaSupportedCountry(resolvedLocation.countryCode)
      ) {
        result = await loadJobOpportunities({
          what: query.primaryQuery,
          // Falls back to the resolved region (e.g. "New Jersey") when no
          // city is available — a state/region-level destination has no
          // city/town/village/county in its resolved address, so `city`
          // alone left the search unfiltered by location entirely.
          where: resolvedLocation.city || resolvedLocation.region,
          country: resolvedLocation.countryCode,
        });
      } else if (resolvedLocation.countryCode && !resolvedLocation.isRemote && resolvedLocation.countryName) {
        // Country resolved, but it isn't one of the job-search provider's
        // supported boards — skip the live call (already known to be
        // rejected) and say so specifically.
        result = errorResult(
          `Live job listings for ${resolvedLocation.countryName} aren't currently supported by our job-search provider.`
        );
      } else {
        // Truly unresolved/ambiguous, or remote — no country to search a
        // local market in at all.
        result = errorResult('No resolved destination country was provided for the search.');
      }

      if (!cancelled) {
        setLocalJobResult(result);
        setLocalJobsLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [parsedProfile, workModels, resolvedLocation]);

  // REMOTE search — independent of Local. Uses the same resolved country
  // (Adzuna's API is inherently country-scoped — there is no borderless
  // "remote" endpoint) but deliberately WITHOUT the city/region `where`
  // constraint, so it's a genuinely broader, separate query rather than a
  // relabeled copy of Local's narrower result — a Local-specific empty
  // result or failure can never affect this one.
  useEffect(() => {
    if (!parsedProfile || !workModels.includes('remote') || !resolvedLocation) {
      setRemoteJobResult(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setRemoteJobsLoading(true);

      const query = deriveJobQuery(parsedProfile);
      let result: JobFetchResult;

      if (
        resolvedLocation.countryCode &&
        !resolvedLocation.isRemote &&
        isAdzunaSupportedCountry(resolvedLocation.countryCode)
      ) {
        result = await loadJobOpportunities({
          what: query.primaryQuery,
          country: resolvedLocation.countryCode,
        });
      } else if (resolvedLocation.countryCode && !resolvedLocation.isRemote && resolvedLocation.countryName) {
        result = errorResult(
          `Live job listings for ${resolvedLocation.countryName} aren't currently supported by our job-search provider.`
        );
      } else {
        result = errorResult('No resolved destination country was provided for the search.');
      }

      if (!cancelled) {
        setRemoteJobResult(result);
        setRemoteJobsLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [parsedProfile, workModels, resolvedLocation]);

  // Reports the single "best" result up to App.tsx for AI context — same
  // callback contract as before (one JobFetchResult + the selected work
  // models), just now recomputed whenever either independent search
  // resolves, rather than there being only one search to report.
  useEffect(() => {
    if (primaryJobResult) {
      onJobsResolved?.(primaryJobResult, workModels);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryJobResult]);

  // Verification aid — confirms each independent fetch's own outcome.
  useEffect(() => {
    if (localJobsLoading) {
      console.debug('[JobMatcherTab] loading Local opportunities…');
    } else if (localJobResult) {
      console.debug(
        `[JobMatcherTab] Local fetch complete — source: ${localJobResult.source}, jobs: ${localJobResult.jobs.length}` +
          (localJobResult.reason ? `, reason: ${localJobResult.reason}` : '')
      );
    }
  }, [localJobResult, localJobsLoading]);

  useEffect(() => {
    if (remoteJobsLoading) {
      console.debug('[JobMatcherTab] loading Remote opportunities…');
    } else if (remoteJobResult) {
      console.debug(
        `[JobMatcherTab] Remote fetch complete — source: ${remoteJobResult.source}, jobs: ${remoteJobResult.jobs.length}` +
          (remoteJobResult.reason ? `, reason: ${remoteJobResult.reason}` : '')
      );
    }
  }, [remoteJobResult, remoteJobsLoading]);

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
            <CareerProfile
              profile={parsedProfile}
              jobs={primaryJobResult?.jobs}
              jobSource={primaryJobResult?.source}
              jobReason={primaryJobResult?.reason}
            />
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
              localJobs={localJobResult?.jobs}
              localJobSource={localJobResult?.source}
              localJobReason={localJobResult?.reason}
              localJobsLoading={localJobsLoading}
              remoteJobs={remoteJobResult?.jobs}
              remoteJobSource={remoteJobResult?.source}
              remoteJobReason={remoteJobResult?.reason}
              remoteJobsLoading={remoteJobsLoading}
              onAnalyzeSkillGaps={scrollToSkillAnalysis}
              destinationCountryName={resolvedLocation?.countryName}
            />
          </section>

          {/* Tier 3 — skill gap detail */}
          <section
            ref={skillAnalysisRef}
            className="rounded-lg border p-2 sm:p-4"
            style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface-2)' }}
          >
            <SkillAnalysis
              profile={parsedProfile}
              jobs={primaryJobResult?.jobs}
              jobSource={primaryJobResult?.source}
              jobReason={primaryJobResult?.reason}
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
