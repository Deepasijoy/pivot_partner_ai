import { useEffect, useState } from 'react';
import { buildDestinationResources, type DestinationResources } from '../services/destinationResourceService';

export function useDestinationResources(destination: string, origin: string) {
  const [resources, setResources] = useState<DestinationResources | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    buildDestinationResources(destination, origin).then((result) => {
      if (!cancelled) {
        setResources(result);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [destination, origin]);

  return { resources, loading };
}
