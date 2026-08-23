import React from 'react';
import { Globe, Briefcase, Home, Users } from 'lucide-react';

interface TabNavigationProps {
  activeTab: 'relocation' | 'career' | 'life' | 'community';
  onTabChange: (
    tab: 'relocation' | 'career' | 'life' | 'community'
  ) => void;
}

const TabNavigation: React.FC<TabNavigationProps> = ({
  activeTab,
  onTabChange,
}) => {
  const tabs = [
    {
      id: 'relocation',
      label: '🌍 Relocation',
      icon: Globe,
    },
    {
      id: 'career',
      label: '💼 Career & Income',
      icon: Briefcase,
    },
    {
      id: 'life',
      label: '🏠 Life Setup',
      icon: Home,
    },
    {
      id: 'community',
      label: '👥 Community',
      icon: Users,
    },
  ];

  return (
    <div className="bg-white border-b border-[#F5F5F5] sticky top-0 z-10">

      <div className="flex gap-0">

        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id as typeof activeTab)}
              className={`
                flex items-center gap-2 px-5 py-4 text-sm font-medium
                transition-all duration-300 relative group
                ${
                  isActive
                    ? 'text-[#26c485] border-b-2 border-[#26c485]'
                    : 'text-[#333333]/60 hover:text-[#333333] border-b-2 border-transparent'
                }
                cursor-pointer
              `}
            >
              <Icon
                size={16}
                className={
                  isActive ? 'text-[#26c485]' : ''
                }
              />

              <span>{tab.label}</span>

              {/* Hover indicator */}
              {!isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#26c485]/20 group-hover:bg-[#26c485]/40 transition-colors duration-200" />
              )}

              {/* Active indicator */}
              {isActive && (
                <div className="absolute -bottom-0.5 left-0 right-0 h-1 bg-[#26c485] shadow-soft" />
              )}
            </button>
          );
        })}

      </div>

    </div>
  );
};

export default TabNavigation;