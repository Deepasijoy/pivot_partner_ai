import React, { useState } from 'react';
import type { ResumeProfile } from '../types';
import ResumeUploader from './ResumeUploader';
import CareerProfile from './CareerProfile';
import CareerRecommendations from './CareerRecommendations';
import SkillAnalysis from './SkillAnalysis';

interface JobMatcherTabProps {
  onProfileParsed?: (profile: ResumeProfile) => void;
}

const JobMatcherTab: React.FC<JobMatcherTabProps> = ({ onProfileParsed }) => {
  const [parsedProfile, setParsedProfile] = useState<ResumeProfile | null>(null);

  const handleProfileParsed = (profile: ResumeProfile) => {
    setParsedProfile(profile);
    onProfileParsed?.(profile);
  };

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

      {parsedProfile && (
        <>
          {/* Tier 1 — hero: overall career profile */}
          <section>
            <CareerProfile profile={parsedProfile} />
          </section>

          {/* Tier 2 — recommended paths */}
          <section>
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-strong)' }}>
              Recommended Paths
            </h3>
            <CareerRecommendations profile={parsedProfile} />
          </section>

          {/* Tier 3 — skill gap detail */}
          <section
            className="rounded-lg border p-2 sm:p-4"
            style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface-2)' }}
          >
            <SkillAnalysis profile={parsedProfile} />
          </section>

          <button
            onClick={() => setParsedProfile(null)}
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
