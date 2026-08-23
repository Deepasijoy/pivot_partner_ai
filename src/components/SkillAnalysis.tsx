import React, { useEffect, useState } from 'react';
import type { ResumeProfile, SkillGap, CourseRecommendation, CareerPath } from '../types';
import { calculateSkillGaps, recommendCourses } from '../services/skillAnalysisService';
import { matchJobsForUser, generateCareerPaths } from '../services/matchingService';
import { AlertCircle, TrendingUp, BookOpen } from 'lucide-react';

interface SkillAnalysisProps {
  profile: ResumeProfile;
  onCareerPathsGenerated?: (paths: CareerPath[]) => void;
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

function formatTimeline(skillGaps: SkillGap[]): string {
  if (skillGaps.length === 0) return 'Ready now';
  const totalWeeks = skillGaps.reduce((sum, gap) => sum + gap.estimatedTimeWeeks, 0);
  return `~${totalWeeks} weeks to close skill gaps`;
}

const SkillAnalysis: React.FC<SkillAnalysisProps> = ({ profile, onCareerPathsGenerated }) => {
  const [skillGaps, setSkillGaps] = useState<SkillGap[] | null>(null);
  const [recommendedCourses, setRecommendedCourses] = useState<CourseRecommendation[]>([]);
  const [careerPaths, setCareerPaths] = useState<CareerPath[]>([]);
  const [matchScore, setMatchScore] = useState<number>(0);

  useEffect(() => {
    const matchedJobs = matchJobsForUser(profile.skills);
    const paths = generateCareerPaths(profile.skills, matchedJobs);
    const topJob = matchedJobs[0];
    const gaps = topJob ? calculateSkillGaps(profile.skills, topJob.requiredSkills) : [];
    const courses = recommendCourses(gaps);
    const overallMatchScore = paths[0]?.matchPercentage ?? topJob?.matchScore ?? 0;

    setSkillGaps(gaps);
    setRecommendedCourses(courses);
    setCareerPaths(paths);
    setMatchScore(overallMatchScore);
    onCareerPathsGenerated?.(paths);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const bannerAccent = getBannerAccent(matchScore);

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 space-y-8">
      <div className="flex items-center justify-between rounded-lg p-4" style={{ backgroundColor: 'var(--surface-2)' }}>
        <div className="flex items-center gap-2">
          <TrendingUp style={{ color: bannerAccent }} size={20} />
          <span className="font-medium text-[var(--text-dark)]">Overall market fit</span>
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
            const colors = getMatchColorClasses(path.matchPercentage);
            return (
              <div
                key={path.id}
                className="rounded-lg border border-[var(--border-light)] bg-[var(--surface)] p-5 shadow-sm flex flex-col gap-3"
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
                    <span className="font-medium">Salary:</span> {path.salaryRange}
                  </p>
                  <p className="text-[var(--text-dark)]">
                    <span className="font-medium">Timeline:</span> {formatTimeline(path.skillGaps)}
                  </p>
                </div>
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
