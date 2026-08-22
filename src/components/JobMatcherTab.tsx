import React, { useState } from 'react';
import type { ResumeProfile } from '../types';
import ResumeUploader from './ResumeUploader';
import CareerProfile from './CareerProfile';
import CareerRecommendations from './CareerRecommendations';

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
    <div className="space-y-6 p-6">
      {/* Upload Resume */}
      {!parsedProfile && (
        <div className="rounded-lg border border-[#F5F5F5] bg-white p-6">
          <h3 className="text-lg font-semibold text-[#333333] mb-4">Upload Your Resume</h3>
          <ResumeUploader onParsed={handleProfileParsed} />
        </div>
      )}

      {/* Career Profile */}
      {parsedProfile && (
        <div>
          <h3 className="text-lg font-semibold text-[#333333] mb-4">Your Career Profile</h3>
          <CareerProfile profile={parsedProfile} />
        </div>
      )}

      {/* Career Recommendations */}
      {parsedProfile && (
        <div>
          <h3 className="text-lg font-semibold text-[#333333] mb-4">Recommended Paths</h3>
          <CareerRecommendations profile={parsedProfile} />
        </div>
      )}

      {/* Reset Button */}
      {parsedProfile && (
        <button
          onClick={() => setParsedProfile(null)}
          className="rounded-lg bg-[#F5F5F5] px-4 py-2 text-sm font-medium text-[#333333] transition-colors hover:bg-gray-300"
        >
          Upload Different Resume
        </button>
      )}
    </div>
  );
};

export default JobMatcherTab;