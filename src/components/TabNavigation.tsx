import React, { useEffect, useRef, useState } from 'react';
import { Globe, Briefcase, Home, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import type { PillarTab as Tab } from '../types';

interface TabNavigationProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

// `badge` flags a pillar that is not yet meaningfully functional at all
// (Community — every category is "Launching soon", see CommunityResources)
// so the primary nav itself signals that before a visitor taps in, instead
// of only the "Launching soon" chips inside the tab. Life Setup is
// deliberately excluded — Housing is a real, working feature there, so
// tagging the whole tab "Soon" would be inaccurate.
const TABS: { id: Tab; label: string; icon: typeof Globe; accent: string; badge?: string }[] = [
  { id: 'relocation', label: 'Relocation', icon: Globe, accent: 'var(--primary-dark)' },
  { id: 'career', label: 'Career & Income', icon: Briefcase, accent: 'var(--accent-gold)' },
  { id: 'life', label: 'Life Setup', icon: Home, accent: 'var(--accent-terracotta)' },
  { id: 'community', label: 'Community', icon: Users, accent: 'var(--accent-indigo)', badge: 'Soon' },
];

// How far past an edge (px) before treating the bar as "can scroll that
// way" — small tolerance so sub-pixel rounding near a true edge doesn't
// flicker the affordance on/off.
const EDGE_TOLERANCE = 4;

const TabNavigation: React.FC<TabNavigationProps> = ({ activeTab, onTabChange }) => {
  // At real phone width, all four tabs don't fit — the bar already scrolled
  // horizontally, but nothing on screen showed a visitor that "Life Setup"
  // and "Community" existed off to the right. These two edge cues (fade +
  // arrow button) make the overflow visible and give a real tap target to
  // move the bar, on top of the swipe that already worked.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updateAffordance = () => {
      setCanScrollLeft(el.scrollLeft > EDGE_TOLERANCE);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_TOLERANCE);
    };

    updateAffordance();
    el.addEventListener('scroll', updateAffordance, { passive: true });
    window.addEventListener('resize', updateAffordance);
    return () => {
      el.removeEventListener('scroll', updateAffordance);
      window.removeEventListener('resize', updateAffordance);
    };
  }, []);

  const scrollByAmount = (amount: number) => {
    scrollRef.current?.scrollBy({ left: amount, behavior: 'smooth' });
  };

  return (
    <div
      className="sticky top-0 z-10 relative border-b"
      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-warm)' }}
    >
      <div ref={scrollRef} className="flex gap-0 overflow-x-auto">
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
              {tab.badge && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                  style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}
                >
                  {tab.badge}
                </span>
              )}

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

      {canScrollLeft && (
        <>
          <div
            className="pointer-events-none absolute left-0 top-0 bottom-0 w-10"
            style={{ background: 'linear-gradient(to right, var(--surface), transparent)' }}
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={() => scrollByAmount(-120)}
            aria-label="Scroll tabs left"
            className="absolute left-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full shadow-soft"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border-warm)', color: 'var(--text-muted)' }}
          >
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
        </>
      )}

      {canScrollRight && (
        <>
          <div
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-10"
            style={{ background: 'linear-gradient(to left, var(--surface), transparent)' }}
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={() => scrollByAmount(120)}
            aria-label="Scroll tabs right"
            className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full shadow-soft"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border-warm)', color: 'var(--text-muted)' }}
          >
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
};

export default TabNavigation;
