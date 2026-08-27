import { useEffect, useState } from 'react';
import { buildDestinationResources, type DestinationResources } from '../services/destinationResourceService';
import type { HousingFilters } from '../types';

export function useDestinationResources(destination: string, origin: string, housingFilters?: HousingFilters) {
  const [resources, setResources] = useState<DestinationResources | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    buildDestinationResources(destination, origin, housingFilters).then((result) => {
      if (!cancelled) {
        setResources(result);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, origin, JSON.stringify(housingFilters)]);

  return { resources, loading };
}
