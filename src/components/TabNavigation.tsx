import React from 'react';
import { Globe, Briefcase, Home, Users } from 'lucide-react';
import type { PillarTab as Tab } from '../types';

interface TabNavigationProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string; icon: typeof Globe; accent: string }[] = [
  { id: 'relocation', label: 'Relocation', icon: Globe, accent: 'var(--primary-dark)' },
  { id: 'career', label: 'Career & Income', icon: Briefcase, accent: 'var(--accent-gold)' },
  { id: 'life', label: 'Life Setup', icon: Home, accent: 'var(--accent-terracotta)' },
  { id: 'community', label: 'Community', icon: Users, accent: 'var(--accent-indigo)' },
];

const TabNavigation: React.FC<TabNavigationProps> = ({ activeTab, onTabChange }) => {
  return (
    <div
      className="sticky top-0 z-10 border-b"
      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-warm)' }}
    >
      <div className="flex gap-0 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className="group relative flex shrink-0 items-center gap-2 px-5 py-4 text-sm font-medium transition-all duration-300"
              style={{
                color: isActive ? tab.accent : 'var(--text-muted)',
                borderBottom: `2px solid ${isActive ? tab.accent : 'transparent'}`,
              }}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{tab.label}</span>

              {isActive && (
                <div
                  className="absolute -bottom-0.5 left-0 right-0 h-1"
                  style={{ backgroundColor: tab.accent }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TabNavigation;
