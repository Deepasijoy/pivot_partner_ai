import React, { useState } from 'react';
import { Home, ExternalLink } from 'lucide-react';
import { useDestinationResources } from '../hooks/useDestinationResources';
import type { HousingFilters } from '../types';

interface HousingResourcesProps {
  destination: string;
  origin: string;
}

const BEDROOM_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'studio', label: 'Studio' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4+', label: '4+' },
];

const PROPERTY_TYPE_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'house', label: 'House' },
  { value: 'condo', label: 'Condo' },
  { value: 'studio', label: 'Studio' },
  { value: 'room', label: 'Room' },
];

const FURNISHED_OPTIONS: { value: HousingFilters['furnished']; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'furnished', label: 'Furnished' },
  { value: 'unfurnished', label: 'Unfurnished' },
];

const toggleButtonStyle = (isSelected: boolean): React.CSSProperties =>
  isSelected
    ? { borderColor: 'var(--primary-dark)', backgroundColor: 'var(--primary-light)', color: 'var(--primary-dark)' }
    : { borderColor: 'var(--border-warm)', color: 'var(--text-body)' };

const HousingResources: React.FC<HousingResourcesProps> = ({ destination, origin }) => {
  // Pending filters back the input controls directly, so typing never
  // touches useDestinationResources (and never triggers a rebuild/refetch).
  // Applied filters are what's actually passed to the hook, and only change
  // when the user clicks "Apply filters".
  const [pendingFilters, setPendingFilters] = useState<HousingFilters>({ furnished: 'any' });
  const [appliedFilters, setAppliedFilters] = useState<HousingFilters>({ furnished: 'any' });
  const { resources, loading } = useDestinationResources(destination, origin, appliedFilters);

  const updateFilter = <K extends keyof HousingFilters>(key: K, value: HousingFilters[K]) => {
    setPendingFilters((prev) => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => setAppliedFilters(pendingFilters);

  return (
    <div className="bg-[var(--surface)] rounded-md p-4 border" style={{ borderColor: 'var(--border-warm)' }}>
      <div className="flex items-center gap-2 font-medium text-[var(--accent-terracotta-strong)] mb-1">
        <Home size={16} aria-hidden="true" />
        Housing resources for your destination
      </div>

      {!destination.trim() && (
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Add your destination in Relocation to see housing resources here.
        </p>
      )}

      {destination.trim() && !resources?.isRemote && (
        <>
          <div className="mt-3 mb-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="housing-area" className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                Location / area
              </label>
              <input
                id="housing-area"
                type="text"
                value={pendingFilters.area ?? ''}
                onChange={(e) => updateFilter('area', e.target.value)}
                placeholder="e.g. Alfama"
                className="text-sm"
              />
            </div>

            <div>
              <label htmlFor="housing-budget" className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                Monthly budget
              </label>
              <input
                id="housing-budget"
                type="number"
                min={0}
                value={pendingFilters.budgetMax ?? ''}
                onChange={(e) => updateFilter('budgetMax', e.target.value ? Number(e.target.value) : undefined)}
                placeholder="e.g. 1500"
                className="text-sm"
              />
            </div>

            <div>
              <label htmlFor="housing-bedrooms" className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                Bedrooms
              </label>
              <select
                id="housing-bedrooms"
                value={pendingFilters.bedrooms ?? ''}
                onChange={(e) => updateFilter('bedrooms', e.target.value || undefined)}
                className="text-sm"
              >
                {BEDROOM_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="housing-property-type" className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                Property type
              </label>
              <select
                id="housing-property-type"
                value={pendingFilters.propertyType ?? ''}
                onChange={(e) => updateFilter('propertyType', e.target.value || undefined)}
                className="text-sm"
              >
                {PROPERTY_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                Furnished
              </span>
              <div className="flex flex-wrap gap-1.5">
                {FURNISHED_OPTIONS.map((option) => {
                  const isSelected = (pendingFilters.furnished ?? 'any') === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateFilter('furnished', option.value)}
                      aria-pressed={isSelected}
                      className="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
                      style={toggleButtonStyle(isSelected)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                Family-friendly
              </span>
              <button
                type="button"
                onClick={() => updateFilter('familyFriendly', !pendingFilters.familyFriendly)}
                aria-pressed={!!pendingFilters.familyFriendly}
                className="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
                style={toggleButtonStyle(!!pendingFilters.familyFriendly)}
              >
                {pendingFilters.familyFriendly ? 'Yes' : 'Any'}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={applyFilters}
            className="mb-4 rounded-md px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--primary-dark)' }}
          >
            Apply filters
          </button>
        </>
      )}

      {destination.trim() && loading && (
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Finding resources…
        </p>
      )}

      {!loading && resources?.isRemote && (
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Your destination is set to Remote — housing resources apply to a specific place, so add a city or country
          in Relocation to see them.
        </p>
      )}

      {!loading && resources && !resources.isRemote && resources.housing.length > 0 && (
        <>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            External search results: PivotPartner creates targeted searches based on your preferences. Results are
            provided by external sources and are not verified by PivotPartner. Please verify availability, pricing,
            and listing details directly with the source.
          </p>

          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Searching for {resources.locationLabel}.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {resources.housing.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 rounded-md border p-3 text-sm transition-colors hover:border-[var(--accent-terracotta)]"
                style={{ borderColor: 'var(--border-warm)' }}
              >
                <ExternalLink size={14} className="mt-0.5 shrink-0 text-[var(--accent-terracotta-strong)]" aria-hidden="true" />
                <span>
                  <span className="block font-medium" style={{ color: 'var(--text-strong)' }}>
                    {link.label}
                  </span>
                  <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                    {link.description}
                  </span>
                </span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default HousingResources;
