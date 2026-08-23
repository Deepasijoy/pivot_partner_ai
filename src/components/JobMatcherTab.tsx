import React, { useState } from 'react';
import type { ResumeProfile, WorkModel } from '../types';
import ResumeUploader from './ResumeUploader';
import CareerProfile from './CareerProfile';
import CareerRecommendations from './CareerRecommendations';
import SkillAnalysis from './SkillAnalysis';
import WorkModelSelector from './WorkModelSelector';

interface JobMatcherTabProps {
  onProfileParsed?: (profile: ResumeProfile) => void;
  onSendPrompt?: (text: string) => void;
}

const JobMatcherTab: React.FC<JobMatcherTabProps> = ({ onProfileParsed, onSendPrompt }) => {
  const [parsedProfile, setParsedProfile] = useState<ResumeProfile | null>(null);
  const [workModels, setWorkModels] = useState<WorkModel[]>([]);

  const handleProfileParsed = (profile: ResumeProfile) => {
    setParsedProfile(profile);
    onProfileParsed?.(profile);
  };

  const handleReset = () => {
    setParsedProfile(null);
    setWorkModels([]);
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
            <CareerRecommendations profile={parsedProfile} workModels={workModels} onSendPrompt={onSendPrompt} />
          </section>

          {/* Tier 3 — skill gap detail */}
          <section
            className="rounded-lg border p-2 sm:p-4"
            style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface-2)' }}
          >
            <SkillAnalysis profile={parsedProfile} />
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
