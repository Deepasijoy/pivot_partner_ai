import React, { useEffect, useRef } from 'react';
import type { ResumeProfile, WorkModel } from '../types';
import ResumeUploader from './ResumeUploader';
import CareerProfile from './CareerProfile';
import CareerRecommendations from './CareerRecommendations';
import SkillAnalysis from './SkillAnalysis';
import WorkModelSelector from './WorkModelSelector';
import { resolveDestination, isAdzunaSupportedCountry, type ResolvedLocation } from '../services/locationService';
import { deriveJobQuery } from '../services/jobQueryService';
import { loadJobOpportunities, errorResult, type JobFetchResult } from '../services/jobService';

// Everything Career & Income needs to remember across a visit besides the
// parsed resume itself (which App.tsx already tracks separately). Lifted to
// App.tsx and passed in as a controlled prop — App.tsx never unmounts, so
// this survives the user navigating away to another tab and back, unlike a
// local useState here (JobMatcherTab itself is unmounted whenever
// activeTab !== 'career', which previously reset all of this to empty).
export interface CareerSearchState {
  workModels: WorkModel[];
  resolvedLocation: ResolvedLocation | null;
  localJobResult: JobFetchResult | null;
  localJobsLoading: boolean;
  remoteJobResult: JobFetchResult | null;
  remoteJobsLoading: boolean;
}

export const INITIAL_CAREER_SEARCH_STATE: CareerSearchState = {
  workModels: [],
  resolvedLocation: null,
  localJobResult: null,
  localJobsLoading: false,
  remoteJobResult: null,
  remoteJobsLoading: false,
};

interface JobMatcherTabProps {
  parsedProfile: ResumeProfile | null;
  onProfileParsed?: (profile: ResumeProfile) => void;
  // Called by "Upload Different Resume" to clear the parent's parsedProfile
  // (the profile itself lives in App.tsx, not here — see CareerSearchState
  // above for why).
  onResetProfile?: () => void;
  searchState: CareerSearchState;
  onSearchStateChange: (patch: Partial<CareerSearchState>) => void;
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
  parsedProfile,
  onProfileParsed,
  onResetProfile,
  searchState,
  onSearchStateChange,
  onSendPrompt,
  destination,
  onJobsResolved,
  scrollContainerRef,
}) => {
  const { workModels, resolvedLocation, localJobResult, localJobsLoading, remoteJobResult, remoteJobsLoading } =
    searchState;
  // Thin wrappers with the same call signature as the useState setters they
  // replace, so every existing call site below (setWorkModels([]),
  // setLocalJobResult(result), etc.) is unchanged — they just now write to
  // the lifted parent state instead of a local one that gets wiped on
  // unmount.
  const setWorkModels = (workModels: WorkModel[]) => onSearchStateChange({ workModels });
  const setResolvedLocation = (resolvedLocation: ResolvedLocation | null) => onSearchStateChange({ resolvedLocation });
  const setLocalJobResult = (localJobResult: JobFetchResult | null) => onSearchStateChange({ localJobResult });
  const setLocalJobsLoading = (localJobsLoading: boolean) => onSearchStateChange({ localJobsLoading });
  const setRemoteJobResult = (remoteJobResult: JobFetchResult | null) => onSearchStateChange({ remoteJobResult });
  const setRemoteJobsLoading = (remoteJobsLoading: boolean) => onSearchStateChange({ remoteJobsLoading });

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
    onProfileParsed?.(profile);
  };

  const handleReset = () => {
    onResetProfile?.();
    onSearchStateChange(INITIAL_CAREER_SEARCH_STATE);
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
