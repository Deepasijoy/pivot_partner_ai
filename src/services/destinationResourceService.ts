import { resolveDestination } from './locationService';

// Builds destination-aware RESOURCE LINKS for Housing and Community — not
// listings, not inventory, not fabricated data. Every link is a plain
// external search/map URL parameterized by the user's own resolved
// destination text, so it works for any city or country without a
// hard-coded mapping table and without a paid API (no Google Maps API key,
// no listings API). Reuses the existing, unmodified resolveDestination()
// from locationService.ts rather than re-resolving location itself.

export interface ResourceLink {
  label: string;
  description: string;
  url: string;
}

export interface DestinationResources {
  // Human-readable label for what was actually resolved (e.g. "Lisbon,
  // Portugal"), or the raw typed text if resolution didn't fully succeed.
  locationLabel: string;
  isRemote: boolean;
  // False when there's no destination text yet, or it couldn't be
  // resolved to anything usable at all.
  resolved: boolean;
  housing: ResourceLink[];
  community: ResourceLink[];
}

const EMPTY_RESOURCES: DestinationResources = {
  locationLabel: '',
  isRemote: false,
  resolved: false,
  housing: [],
  community: [],
};

function searchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function mapsUrl(query: string): string {
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
}

function buildHousingLinks(label: string): ResourceLink[] {
  return [
    {
      label: 'Rental & property listings',
      description: 'Search external listing sites for available rentals.',
      url: searchUrl(`apartments for rent in ${label}`),
    },
    {
      label: 'Local real-estate portals',
      description: 'Find property portals covering this area.',
      url: searchUrl(`real estate portal ${label}`),
    },
    {
      label: 'Relocation & housing guide',
      description: 'General guidance on moving to and settling in this area.',
      url: searchUrl(`relocation housing guide ${label}`),
    },
    {
      label: 'Neighbourhood research',
      description: 'Compare neighbourhoods, commute and cost of living.',
      url: searchUrl(`best neighborhoods to live in ${label}`),
    },
    {
      label: 'Map of the area',
      description: 'Explore the destination on a map.',
      url: mapsUrl(label),
    },
  ];
}

function buildCommunityLinks(label: string, origin: string): ResourceLink[] {
  const originClause = origin.trim() ? `${origin.trim()} ` : '';

  return [
    {
      label: 'Expat communities',
      description: 'Find expat groups and forums for this destination.',
      url: searchUrl(`expat community ${label}`),
    },
    {
      label: 'Community & cultural associations',
      description: 'Local associations and cultural groups.',
      url: searchUrl(`community associations ${label}`),
    },
    {
      label: 'Professional associations',
      description: 'Industry and professional networking bodies.',
      url: searchUrl(`professional associations ${label}`),
    },
    {
      label: 'Embassy / consulate resources',
      description: 'Official diplomatic resources for your move.',
      url: searchUrl(`${originClause}embassy consulate ${label}`),
    },
    {
      label: 'Community events',
      description: 'Local meetups, events and gatherings.',
      url: searchUrl(`community events ${label}`),
    },
    {
      label: 'Networking groups',
      description: 'Professional and social networking groups.',
      url: searchUrl(`networking groups ${label}`),
    },
  ];
}

export async function buildDestinationResources(
  destination: string,
  origin: string
): Promise<DestinationResources> {
  const trimmedDestination = destination.trim();
  if (!trimmedDestination) {
    return EMPTY_RESOURCES;
  }

  const location = await resolveDestination(trimmedDestination);

  if (location.isRemote) {
    return { locationLabel: 'Remote', isRemote: true, resolved: true, housing: [], community: [] };
  }

  const label =
    location.city && location.countryName
      ? `${location.city}, ${location.countryName}`
      : location.countryName || trimmedDestination;

  if (!label) {
    return { ...EMPTY_RESOURCES, locationLabel: trimmedDestination };
  }

  return {
    locationLabel: label,
    isRemote: false,
    resolved: true,
    housing: buildHousingLinks(label),
    community: buildCommunityLinks(label, origin),
  };
}
