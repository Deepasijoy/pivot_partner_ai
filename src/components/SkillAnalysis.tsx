import React, { useEffect, useState } from 'react';
import type { ResumeProfile, SkillGap, CourseRecommendation, CareerPath, JobOpportunity } from '../types';
import { recommendCourses } from '../services/skillAnalysisService';
import { matchJobsForUser, generateCareerPaths, mergeCareerPathSkillGaps } from '../services/matchingService';
import { jobsForCareerGuidance, type JobFetchSource } from '../services/jobService';
import { AlertCircle, TrendingUp, BookOpen } from 'lucide-react';

interface SkillAnalysisProps {
  profile: ResumeProfile;
  onCareerPathsGenerated?: (paths: CareerPath[]) => void;
  // The "best available" job-fetch result owned by JobMatcherTab — the same
  // data CareerProfile receives. Optional so this still works if a parent
  // hasn't wired it in yet. Skill Gaps/Courses/Career Paths below must keep
  // working even when this is empty/errored — see jobsForCareerGuidance().
  jobs?: JobOpportunity[];
  // Whether `jobs` above is live Adzuna data, a confirmed-empty live
  // result, or an error — the match-score/opportunity labeling below
  // derives from it, but the guidance itself (skill gaps, courses, career
  // paths) never depends on it being 'live'.
  jobSource?: JobFetchSource;
  jobReason?: string;
}

function getMatchColorClasses(score: number): { text: string; bg: string; bar: string } {
  if (score > 80) return { text: 'text-[var(--primary-dark)]', bg: 'bg-[var(--primary-light)]', bar: 'bg-[var(--primary)]' };
  if (score >= 60) return { text: 'text-amber-500', bg: 'bg-amber-50', bar: 'bg-amber-500' };
  return { text: 'text-red-500', bg: 'bg-red-50', bar: 'bg-red-500' };
}

// The "Overall market fit" banner pairs its icon/percentage with a label
// that must stay readable in both themes, so — unlike the self-contained
// badges above, which keep a matched static bg+text pair — it needs a
// dark-aware accent color rather than a static light background.
function getBannerAccent(score: number): string {
  if (score > 80) return 'var(--primary-dark)';
  if (score >= 60) return 'var(--status-warning)';
  return 'var(--status-danger)';
}

function formatTimeline(path: CareerPath): string {
  // An empty skillGaps array is NOT evidence of "ready now" when the
  // underlying listing had no detectable requirements at all — see
  // matchingService.ts's resolveJobCareerPathState / Step C.
  if (path.dataState === 'insufficient_data') return 'Requirements not specified';
  if (path.skillGaps.length === 0) return 'Ready now';
  const totalWeeks = path.skillGaps.reduce((sum, gap) => sum + gap.estimatedTimeWeeks, 0);
  return `~${totalWeeks} weeks to close skill gaps`;
}

const SkillAnalysis: React.FC<SkillAnalysisProps> = ({ profile, onCareerPathsGenerated, jobs, jobSource, jobReason }) => {
  const [skillGaps, setSkillGaps] = useState<SkillGap[] | null>(null);
  const [recommendedCourses, setRecommendedCourses] = useState<CourseRecommendation[]>([]);
  const [careerPaths, setCareerPaths] = useState<CareerPath[]>([]);
  const [matchScore, setMatchScore] = useState<number>(0);
  // Which Career Path card (if any) is expanded to reveal its skills/next
  // step — same click-to-expand pattern CareerRecommendations already uses
  // for its own cards, applied here since that data (path.skillGaps,
  // path.recommendedAction) already exists but wasn't being shown.
  const [expandedPathId, setExpandedPathId] = useState<string | null>(null);

  // No independent fetch here anymore — jobs (live, or a genuinely
  // empty/errored result, tagged upstream by JobMatcherTab) arrive as a
  // prop, so this is now a plain synchronous derivation. Re-runs when the
  // prop updates, e.g. once JobMatcherTab's own fetch resolves after the
  // initial render. jobsForCareerGuidance() supplies the existing mock
  // substrate whenever `jobs` is empty/undefined, so this guidance keeps
  // working with zero live listings — exactly as it always has.
  useEffect(() => {
    const matchedJobs = matchJobsForUser(profile, jobsForCareerGuidance(jobs));
    const paths = generateCareerPaths(profile.skills, matchedJobs, profile.likelyRole, profile.industries);
    // Overall, profile-level gaps: the union of every generated career
    // path's own skill gaps (each already computed by calculateSkillGaps
    // inside generateCareerPaths) — not scoped to a single top job, so this
    // section doesn't claim "no gaps" just because the #1 match happens to
    // have none while other paths (shown below) do.
    const gaps = mergeCareerPathSkillGaps(paths);
    const courses = recommendCourses(gaps);
    const topJob = matchedJobs[0];
    const overallMatchScore =
      paths[0]?.matchPercentage ?? topJob?.matchScore ?? 0;

    setSkillGaps(gaps);
    setRecommendedCourses(courses);
    setCareerPaths(paths);
    setMatchScore(overallMatchScore);
    onCareerPathsGenerated?.(paths);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, jobs]);

  const bannerAccent = getBannerAccent(matchScore);

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 space-y-8">
      <div className="flex items-center justify-between rounded-lg p-4" style={{ backgroundColor: 'var(--surface-2)' }}>
        <div className="flex items-center gap-2">
          <TrendingUp style={{ color: bannerAccent }} size={20} />
          <span className="font-medium text-[var(--text-dark)]">Overall market fit</span>
          {jobSource && (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
              style={
                jobSource === 'live'
                  ? { backgroundColor: 'var(--primary-light)', color: 'var(--primary-dark)' }
                  : { backgroundColor: 'var(--surface)', color: 'var(--text-light)' }
              }
              title={jobSource !== 'live' ? jobReason : undefined}
            >
              {jobSource === 'live'
                ? 'Live opportunities'
                : jobSource === 'empty'
                  ? 'Example opportunities — no live listings found'
                  : 'Example opportunities — live search unavailable'}
            </span>
          )}
        </div>
        <span className="text-2xl font-semibold" style={{ color: bannerAccent }}>{matchScore}%</span>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-[var(--text-dark)] mb-3">Your Skills</h2>
        <div className="flex flex-wrap gap-2">
          {profile.skills.map((skill) => (
            <span
              key={skill.name}
              className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800"
            >
              {skill.name}
            </span>
          ))}
          {profile.skills.length === 0 && (
            <p className="text-sm text-[var(--text-light)]">No skills detected yet.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--text-dark)] mb-3 flex items-center gap-2">
          <AlertCircle className="text-amber-500" size={20} />
          Skill Gaps
        </h2>
        {skillGaps && skillGaps.length > 0 ? (
          <>
            <p className="text-sm font-medium text-[var(--text-dark)] mb-2">
              {skillGaps.length} skill{skillGaps.length === 1 ? '' : 's'} to strengthen
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {skillGaps.map((gap) => (
                <div
                  key={gap.skill.name}
                  className="rounded-lg border border-[var(--border-light)] bg-[var(--surface)] p-4 shadow-sm"
                >
                  <p className="font-medium text-[var(--text-dark)]">{gap.skill.name}</p>
                  <p className="mt-1 text-sm text-[var(--text-light)]">
                    Est. {gap.estimatedTimeWeeks} {gap.estimatedTimeWeeks === 1 ? 'week' : 'weeks'} to close
                  </p>
                </div>
              ))}
            </div>
            {careerPaths[0] && (
              <p className="mt-3 text-sm text-[var(--text-light)]">
                You may still be well-positioned for your top match — {careerPaths[0].title} ({careerPaths[0].matchPercentage}% match).
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-[var(--text-light)]">No major skill gaps — you're well-positioned for your top match.</p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--text-dark)] mb-3 flex items-center gap-2">
          <BookOpen className="text-[var(--primary-dark)]" size={20} />
          Recommended Courses
        </h2>
        {recommendedCourses.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recommendedCourses.map((course) => (
              <div
                key={course.id}
                className="rounded-lg border border-[var(--border-light)] bg-[var(--surface)] p-4 shadow-sm"
              >
                <p className="font-medium text-[var(--text-dark)]">{course.title}</p>
                <p className="mt-1 text-sm text-[var(--text-light)]">
                  {course.platform} · {course.durationWeeks} weeks · {course.cost}
                </p>
                <p className="mt-1 text-xs text-[var(--primary-dark)]">Skill gained: {course.skillGained}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-light)]">No course recommendations right now.</p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--text-dark)] mb-3">Career Paths</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {careerPaths.map((path) => {
            if (path.isUnavailable) {
              // Honest empty state (Step D) — no mock freelance gig is ever
              // presented as if it were a genuinely evaluated opportunity.
              // Mirrors CareerRecommendations.tsx's own "Freelance
              // opportunities are currently unavailable" treatment, kept in
              // its own card so the grid still shows 3 slots.
              return (
                <div
                  key={path.id}
                  className="rounded-lg border border-[var(--border-light)] bg-[var(--surface)] p-5 shadow-sm flex flex-col gap-2"
                >
                  <h3 className="font-semibold text-[var(--text-dark)]">{path.title}</h3>
                  <p className="text-sm text-[var(--text-light)]">{path.whyItFits}</p>
                </div>
              );
            }

            const colors = getMatchColorClasses(path.matchPercentage);
            // Freelance paths are always built from mockFreelanceGigs (no
            // live freelance data source exists) — always example data,
            // regardless of jobSource. Job-based paths reuse the same
            // job.salaryRange as the live/fallback job listings, so they're
            // real employer data only when jobSource is 'live'.
            const isEstimateSalary = path.title.startsWith('Freelance:') || jobSource !== 'live';
            const isExpanded = expandedPathId === path.id;
            return (
              <div
                key={path.id}
                onClick={() => setExpandedPathId(isExpanded ? null : path.id)}
                className="cursor-pointer rounded-lg border border-[var(--border-light)] bg-[var(--surface)] p-5 shadow-sm flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-[var(--text-dark)]">{path.title}</h3>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${colors.bg} ${colors.text}`}>
                    {path.matchPercentage}%
                  </span>
                </div>

                <div className="h-2 w-full rounded-full bg-[var(--bg-light)]">
                  <div
                    className={`h-2 rounded-full ${colors.bar}`}
                    style={{ width: `${Math.min(100, Math.max(0, path.matchPercentage))}%` }}
                  />
                </div>

                <p className="text-sm text-[var(--text-light)]">{path.whyItFits}</p>

                <div className="mt-auto space-y-1 text-sm">
                  <p className="text-[var(--text-dark)]">
                    <span className="font-medium">
                      {isEstimateSalary ? 'Estimated salary range (example data):' : 'Salary:'}
                    </span>{' '}
                    {path.salaryRange}
                  </p>
                  <p className="text-[var(--text-dark)]">
                    <span className="font-medium">Timeline:</span> {formatTimeline(path)}
                  </p>
                </div>

                {isExpanded && (
                  <div className="space-y-3 border-t border-[var(--border-light)] pt-3">
                    {path.skillGaps.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-[var(--text-light)] uppercase tracking-wider mb-2">
                          Skills to Develop
                        </p>
                        <div className="space-y-2">
                          {path.skillGaps.map((gap) => (
                            <div
                              key={gap.skill.name}
                              className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-light)] px-3 py-2"
                            >
                              <p className="text-sm font-medium text-[var(--text-dark)]">{gap.skill.name}</p>
                              <p className="text-xs text-[var(--text-light)]">
                                Est. {gap.estimatedTimeWeeks} {gap.estimatedTimeWeeks === 1 ? 'week' : 'weeks'} to close
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-light)] uppercase tracking-wider mb-1">
                        Next Step
                      </p>
                      <p className="text-sm text-[var(--text-dark)]">{path.recommendedAction}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {careerPaths.length === 0 && (
            <p className="text-sm text-[var(--text-light)]">No career paths available yet.</p>
          )}
        </div>
      </section>
    </div>
  );
};

export default SkillAnalysis;
