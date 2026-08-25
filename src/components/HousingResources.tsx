import React from 'react';
import { Home, ExternalLink } from 'lucide-react';
import { useDestinationResources } from '../hooks/useDestinationResources';

interface HousingResourcesProps {
  destination: string;
  origin: string;
}

const HousingResources: React.FC<HousingResourcesProps> = ({ destination, origin }) => {
  const { resources, loading } = useDestinationResources(destination, origin);

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
          <p className="text-xs mt-1 mb-3" style={{ color: 'var(--text-muted)' }}>
            External search links for {resources.locationLabel} — not PivotPartner listings.
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
