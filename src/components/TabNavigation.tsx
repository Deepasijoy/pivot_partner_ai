import React from 'react';
import { Globe, Scale, Briefcase, Lock } from 'lucide-react';

interface TabNavigationProps {
  activeTab: 'career' | 'tax' | 'portfolio';
  onTabChange: (tab: 'career' | 'tax' | 'portfolio') => void;
  jobMatched?: boolean;
}

const TabNavigation: React.FC<TabNavigationProps> = ({ activeTab, onTabChange, jobMatched = false }) => {
  const tabs = [
    { id: 'career', label: '🌍 Remote Job Matcher', icon: Globe, enabled: true },
    { id: 'tax', label: '⚖️ Tax Safe-Zone', icon: Scale, enabled: jobMatched, locked: !jobMatched },
    { id: 'portfolio', label: '💼 Portfolio Builder', icon: Briefcase, enabled: jobMatched, locked: !jobMatched },
  ];

  return (
    <div className="bg-white border-b border-[#F5F5F5] sticky top-0 z-10">
      <div className="flex gap-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => tab.enabled && onTabChange(tab.id as 'career' | 'tax' | 'portfolio')}
            disabled={!tab.enabled}
            className={`
              flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all duration-300 relative group
              ${activeTab === tab.id
                ? 'text-[#26c485] border-b-2 border-[#26c485]'
                : 'text-[#333333]/60 hover:text-[#333333] border-b-2 border-transparent'
              }
              ${!tab.enabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
            `}
            title={tab.locked ? 'Unlock by matching with a remote job' : tab.label}
          >
            {tab.locked && <Lock size={14} className="text-gray-400" />}
            <tab.icon size={16} className={activeTab === tab.id ? 'text-[#26c485]' : ''} />
            <span>{tab.label}</span>

            {/* Hover Indicator */}
            {tab.enabled && activeTab !== tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#26c485]/20 group-hover:bg-[#26c485]/40 transition-colors duration-200" />
            )}

            {/* Active Indicator */}
            {activeTab === tab.id && (
              <div className="absolute -bottom-0.5 left-0 right-0 h-1 bg-[#26c485] shadow-soft" />
            )}
          </button>
        ))}
      </div>

      {/* Locked Tab Notice */}
      {!jobMatched && (
        <div className="px-6 py-3 bg-blue-50 border-t border-blue-100 text-xs text-blue-700 flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
          <span>
            <strong>Tax Safe-Zone</strong> and <strong>Portfolio Builder</strong> unlock when you match with a remote job
          </span>
        </div>
      )}
    </div>
  );
};

export default TabNavigation;
