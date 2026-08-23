import React, { useState } from 'react';
import type { ResumeProfile } from '../types';
import { getCareerRecommendations } from '../services/recommendationService';
import { TrendingUp, Zap, Globe, Award } from 'lucide-react';

interface CareerRecommendationsProps {
  profile: ResumeProfile;
}

const CareerRecommendations: React.FC<CareerRecommendationsProps> = ({ profile }) => {
  const recommendations = getCareerRecommendations(profile);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const getMatchColor = (score: number) => {
    if (score >= 80) return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', badge: 'bg-green-100 text-green-800' };
    if (score >= 60) return { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', badge: 'bg-yellow-100 text-yellow-800' };
    return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', badge: 'bg-red-100 text-red-800' };
  };

  return (
    <div className="space-y-4">
      {/* Header with Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-[#26c485]/10 to-[#26c485]/5 rounded-lg p-4 border border-[#26c485]/20">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={16} className="text-[var(--primary-dark)]" />
            <span className="text-xs font-semibold text-[var(--text-light)] uppercase">Avg Match</span>
          </div>
          <p className="text-2xl font-bold text-[var(--primary-dark)]">
            {Math.round(recommendations.reduce((sum, r) => sum + r.matchScore, 0) / recommendations.length)}%
          </p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-5 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center gap-2 mb-1">
            <Award size={16} className="text-blue-600" />
            <span className="text-xs font-semibold text-[var(--text-light)] uppercase">Opportunities</span>
          </div>
          <p className="text-2xl font-bold text-blue-600">
            {recommendations.reduce((sum, r) => sum + r.opportunityCount, 0)}+
          </p>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-5 rounded-lg p-4 border border-purple-200">
          <div className="flex items-center gap-2 mb-1">
            <Zap size={16} className="text-purple-600" />
            <span className="text-xs font-semibold text-[var(--text-light)] uppercase">Matches</span>
          </div>
          <p className="text-2xl font-bold text-purple-600">{recommendations.length}</p>
        </div>
      </div>

      {/* Recommendations Grid */}
      <div className="space-y-3">
        {recommendations.map((rec, index) => {
          const colors = getMatchColor(rec.matchScore);
          const isExpanded = expandedId === rec.id;

          return (
            <div
              key={rec.id}
              className={`animate-slide-in group transition-all duration-300 ${colors.bg} border ${colors.border} rounded-lg overflow-hidden cursor-pointer hover:shadow-card`}
              style={{ animationDelay: `${index * 50}ms` }}
              onClick={() => setExpandedId(isExpanded ? null : rec.id)}
            >
              {/* Card Header */}
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-[var(--text-dark)] mb-1">{rec.title}</h3>
                    <p className="text-sm text-[var(--text-light)]">{rec.reason}</p>
                  </div>
                  <div className={`px-3 py-1.5 rounded-full text-sm font-bold ${colors.badge} whitespace-nowrap ml-3`}>
                    {rec.matchScore}%
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="flex gap-4 mb-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Globe size={14} className="text-[var(--primary-dark)]" />
                    <span className="text-[var(--text-light)]">{rec.opportunityCount}+ roles</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Award size={14} className="text-[var(--primary-dark)]" />
                    <span className="text-[var(--text-light)]">{rec.salaryRange}</span>
                  </div>
                </div>

                {/* Skills Preview */}
                <div className="flex flex-wrap gap-2">
                  {rec.matchedSkills?.slice(0, 3).map((skill) => (
                    <span
                      key={skill.name}
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200"
                    >
                      ✓ {skill.name}
                    </span>
                  ))}
                  {rec.matchedSkills && rec.matchedSkills.length > 3 && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--bg-light)] text-[var(--text-dark)] border border-[var(--border-light)]">
                      +{rec.matchedSkills.length - 3}
                    </span>
                  )}
                </div>
              </div>

              {/* Expandable Section */}
              {isExpanded && (
                <div className="border-t border-current/10 p-4 bg-[var(--surface-2)] space-y-4 animate-slide-in">
                  {/* Missing Skills */}
                  {rec.missingSkills && rec.missingSkills.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-light)] uppercase mb-2 tracking-wider">Skills to Develop</p>
                      <div className="flex flex-wrap gap-2">
                        {rec.missingSkills.slice(0, 5).map((skill) => (
                          <span
                            key={skill.name}
                            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200"
                          >
                            ◯ {skill.name}
                          </span>
                        ))}
                        {rec.missingSkills.length > 5 && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--bg-light)] text-[var(--text-dark)] border border-[var(--border-light)]">
                            +{rec.missingSkills.length - 5}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Recommended Action */}
                  <div className="p-3 bg-[#26c485]/10 border border-[#26c485]/30 rounded-lg">
                    <p className="text-xs font-semibold text-[var(--primary-dark)] uppercase tracking-wider mb-1">Next Step</p>
                    <p className="text-sm font-medium text-[var(--text-dark)]">{rec.recommendedAction}</p>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                    <button className="px-3 py-2 rounded-lg bg-[#26c485] text-white text-xs font-medium transition-all hover:bg-[#1a8b5a] active:scale-95">
                      Explore
                    </button>
                    <button className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--primary-dark)] text-[var(--primary-dark)] text-xs font-medium transition-all hover:bg-[#26c485]/5 active:scale-95">
                      Analyze Gap
                    </button>
                    <button className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--primary-dark)] text-[var(--primary-dark)] text-xs font-medium transition-all hover:bg-[#26c485]/5 active:scale-95">
                      Ask AI
                    </button>
                  </div>
                </div>
              )}

              {/* Expand Indicator */}
              {!isExpanded && (
                <div className="px-4 py-2 bg-[var(--surface-2)] border-t border-current/10 flex items-center justify-center text-xs text-[var(--text-light)] group-hover:text-[var(--text-dark)]">
                  Click to expand
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-6 p-4 bg-[#26c485]/5 border border-[#26c485]/20 rounded-lg text-center">
        <p className="text-sm text-[var(--text-light)]">
          💡 <span className="font-medium">Tip:</span> Click any recommendation to see skills to develop and next steps
        </p>
      </div>
    </div>
  );
};

export default CareerRecommendations;
