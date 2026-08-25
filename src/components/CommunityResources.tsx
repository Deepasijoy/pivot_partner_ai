import React from 'react';
import { Briefcase, Globe, HeartHandshake } from 'lucide-react';

interface CommunityResourcesProps {
  destination: string;
  // Kept in the prop type so the existing call site in App.tsx
  // (destination={destination} origin={origin}) needs no change — not
  // used by this simpler, destination-only design.
  origin?: string;
}

// Community is still "Launching soon" — these are ordinary Google Search
// links (no API, no credentials) giving the user something actionable
// today, dynamically built from the destination already collected in
// Relocation. Never a hard-coded city/country, never a fabricated
// community/event/association.
function communitySearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

interface CommunityCategory {
  title: string;
  detail: string;
  icon: typeof Briefcase;
  queryPrefix: string;
  linkLabel: string;
}

const CATEGORIES: CommunityCategory[] = [
  {
    title: 'Professional Communities',
    detail: 'Connect with people in your industry.',
    icon: Briefcase,
    queryPrefix: 'professional communities in',
    linkLabel: 'Search professional communities',
  },
  {
    title: 'Expat Communities',
    detail: 'Meet people who have made a similar move.',
    icon: Globe,
    queryPrefix: 'expat communities in',
    linkLabel: 'Find expat communities',
  },
  {
    title: 'Women & Family Communities',
    detail: 'Find relevant local groups and activities.',
    icon: HeartHandshake,
    queryPrefix: 'women family communities in',
    linkLabel: 'Find local groups & activities',
  },
];

const CommunityResources: React.FC<CommunityResourcesProps> = ({ destination }) => {
  const trimmedDestination = destination.trim();

  return (
    <div
      className="rounded-lg p-6 sm:p-8 border"
      style={{ backgroundColor: 'var(--accent-indigo-tint)', borderColor: 'var(--accent-indigo)' }}
    >
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-strong)' }}>
          Find Your Community
        </h2>
        <span
          className="rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ backgroundColor: 'var(--surface)', color: 'var(--accent-indigo-strong)' }}
        >
          Launching soon
        </span>
      </div>
      <p className="mb-6" style={{ color: 'var(--text-body)' }}>
        Rebuild your professional and social network in your new country.
      </p>

      {!trimmedDestination && (
        <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
          Add your destination in Relocation to personalize these searches.
        </p>
      )}

      <div className="space-y-3">
        {CATEGORIES.map((category) => {
          const Icon = category.icon;
          const searchUrl = trimmedDestination
            ? communitySearchUrl(`${category.queryPrefix} ${trimmedDestination}`)
            : null;

          return (
            <div
              key={category.title}
              className="bg-[var(--surface)] rounded-md p-4 border"
              style={{ borderColor: 'var(--border-warm)' }}
            >
              <div className="flex items-center gap-2 font-medium text-[var(--accent-indigo-strong)]">
                <Icon size={16} aria-hidden="true" />
                {category.title}
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {category.detail}
              </p>

              {searchUrl && (
                <a
                  href={searchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs font-medium underline"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {category.linkLabel} →
                </a>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs" style={{ color: 'var(--text-light)' }}>
        External resources — PivotPartner does not operate or verify these groups.
      </p>
    </div>
  );
};

export default CommunityResources;
