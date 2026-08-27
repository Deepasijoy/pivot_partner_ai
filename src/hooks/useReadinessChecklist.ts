import { useEffect, useState } from 'react';

// Normalizes a destination string for use as a storage-key suffix — trims,
// lowercases, and collapses internal whitespace, so "Accra", " accra ", and
// "ACCRA" all resolve to the same checklist instead of creating separate
// ones for trivial formatting differences.
function normalizeDestinationKey(destination: string): string {
  return destination.trim().toLowerCase().replace(/\s+/g, ' ');
}

export type ReadinessCategory = 'relocation' | 'documents' | 'housing' | 'finances' | 'community' | 'healthcare';

export interface ReadinessItem {
  id: string;
  label: string;
}

// Short, MVP-scoped checklists. Checking an item means "the user marked
// this as complete" — PivotPartner does not verify, upload, store, or OCR
// any document. This is self-reported progress tracking only.
//
// Only `relocation` drives the main Relocation Readiness score
// (RelocationReadiness.tsx). The other categories (documents, housing,
// finances, community, healthcare) are kept here so they continue to
// exist as addressable checklists, but nothing currently renders them —
// they do not contribute to Relocation Readiness. Career has no checklist
// at all; it uses the real Career & Income match score elsewhere.
export const READINESS_CHECKLISTS: Record<ReadinessCategory, ReadinessItem[]> = {
  relocation: [
    { id: 'reloc-passport', label: 'Passport' },
    { id: 'reloc-visa', label: 'Visa / residence permit' },
    { id: 'reloc-vaccination', label: 'Vaccination / health records' },
    { id: 'reloc-flights', label: 'Flight tickets' },
    { id: 'reloc-travel-docs', label: 'Travel / relocation documents' },
    { id: 'reloc-work-auth', label: 'Employment / work-authorization documents' },
    { id: 'reloc-family', label: 'Family / dependent documents (if applicable)' },
    { id: 'reloc-emergency', label: 'Emergency / important contact documents' },
  ],
  documents: [
    { id: 'doc-passport', label: 'Passport valid' },
    { id: 'doc-visa', label: 'Visa / residence permit' },
    { id: 'doc-employment', label: 'Employment documents' },
    { id: 'doc-education', label: 'Education certificates' },
    { id: 'doc-family', label: 'Marriage / family documents' },
    { id: 'doc-medical', label: 'Medical / health records' },
    { id: 'doc-school', label: "Children's school records" },
    { id: 'doc-license', label: 'Driving licence / international permit' },
  ],
  housing: [
    { id: 'housing-neighborhoods', label: 'Researched neighborhoods' },
    { id: 'housing-budget', label: 'Set a housing budget' },
    { id: 'housing-agents', label: 'Contacted rental agents or property portals' },
    { id: 'housing-temp', label: 'Arranged temporary accommodation' },
    { id: 'housing-lease', label: 'Reviewed lease/rental requirements' },
  ],
  finances: [
    { id: 'finance-bank', label: 'Researched local bank account options' },
    { id: 'finance-cost', label: 'Reviewed cost of living for destination' },
    { id: 'finance-transfer', label: 'Set up an international money transfer method' },
    { id: 'finance-tax', label: 'Reviewed tax implications' },
    { id: 'finance-budget', label: 'Budgeted for moving costs' },
  ],
  community: [
    { id: 'community-groups', label: 'Researched expat/community groups' },
    { id: 'community-professional', label: 'Identified professional associations' },
    { id: 'community-embassy', label: 'Located embassy/consulate information' },
    { id: 'community-networking', label: 'Connected with a local networking group' },
  ],
  healthcare: [
    { id: 'health-insurance', label: 'Reviewed health insurance options' },
    { id: 'health-clinics', label: 'Located nearby clinics/hospitals' },
    { id: 'health-records', label: 'Organized medical records for transfer' },
    { id: 'health-vaccination', label: 'Checked vaccination/health requirements' },
  ],
};

// Legacy (pre-destination-scoping) keys — a single flat checklist shared by
// every destination. Read once for migration, then never written again.
const LEGACY_CHECKED_STORAGE_KEY = 'pivotpartner-readiness-checklist';
const LEGACY_NOT_APPLICABLE_STORAGE_KEY = 'pivotpartner-readiness-not-applicable';
const MIGRATION_DONE_KEY = 'pivotpartner-readiness-migrated-v2';

function checklistStorageKey(destinationKey: string): string {
  return `${LEGACY_CHECKED_STORAGE_KEY}:${destinationKey}`;
}

function notApplicableStorageKey(destinationKey: string): string {
  return `${LEGACY_NOT_APPLICABLE_STORAGE_KEY}:${destinationKey}`;
}

function loadIdSet(key: string): Set<string> {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

// One-time migration: existing users have a single flat checklist with no
// destination scoping. Rather than discard that progress, it's attached to
// whichever destination is active the first time this runs post-upgrade
// (the move they're actively working on), then the legacy keys are removed
// so they can't also leak into a different destination visited later.
// Guarded by MIGRATION_DONE_KEY so this only ever runs once.
function migrateLegacyIfNeeded(destinationKey: string): void {
  try {
    if (window.localStorage.getItem(MIGRATION_DONE_KEY)) return;

    const legacyChecked = window.localStorage.getItem(LEGACY_CHECKED_STORAGE_KEY);
    if (legacyChecked !== null) {
      window.localStorage.setItem(checklistStorageKey(destinationKey), legacyChecked);
      window.localStorage.removeItem(LEGACY_CHECKED_STORAGE_KEY);
    }

    const legacyNotApplicable = window.localStorage.getItem(LEGACY_NOT_APPLICABLE_STORAGE_KEY);
    if (legacyNotApplicable !== null) {
      window.localStorage.setItem(notApplicableStorageKey(destinationKey), legacyNotApplicable);
      window.localStorage.removeItem(LEGACY_NOT_APPLICABLE_STORAGE_KEY);
    }

    window.localStorage.setItem(MIGRATION_DONE_KEY, '1');
  } catch {
    // Best-effort — if this fails, legacy data just isn't migrated this
    // session; nothing else depends on it having succeeded.
  }
}

export function useReadinessChecklist(destination: string) {
  const destinationKey = normalizeDestinationKey(destination);

  // Which destination's data is currently loaded into state. Compared
  // against the (possibly just-changed) destinationKey below so switching
  // destinations swaps to that destination's own saved progress instead of
  // carrying over the previous one's.
  const [loadedKey, setLoadedKey] = useState(destinationKey);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => {
    migrateLegacyIfNeeded(destinationKey);
    return loadIdSet(checklistStorageKey(destinationKey));
  });
  // Items the user marked as not relevant to them (e.g. "Family / dependent
  // documents" for someone travelling alone) — excluded from both the
  // numerator and denominator of the percentage, per "completed applicable
  // items / total applicable items".
  const [notApplicableIds, setNotApplicableIds] = useState<Set<string>>(() =>
    loadIdSet(notApplicableStorageKey(destinationKey))
  );

  // Destination changed since the last render — adjust state during
  // rendering (React's documented pattern for this exact case, guarded by
  // loadedKey so it fires exactly once per change, not on every render)
  // rather than in an effect, so the write-back effects below never see a
  // stale checkedIds/notApplicableIds paired with the new destinationKey.
  if (loadedKey !== destinationKey) {
    setLoadedKey(destinationKey);
    setCheckedIds(loadIdSet(checklistStorageKey(destinationKey)));
    setNotApplicableIds(loadIdSet(notApplicableStorageKey(destinationKey)));
  }

  useEffect(() => {
    if (loadedKey !== destinationKey) return; // mid-transition; next render has the right data
    try {
      window.localStorage.setItem(checklistStorageKey(loadedKey), JSON.stringify(Array.from(checkedIds)));
    } catch {
      // Best-effort persistence only — a private window or blocked storage
      // shouldn't break the checklist within this session.
    }
  }, [checkedIds, loadedKey, destinationKey]);

  useEffect(() => {
    if (loadedKey !== destinationKey) return;
    try {
      window.localStorage.setItem(notApplicableStorageKey(loadedKey), JSON.stringify(Array.from(notApplicableIds)));
    } catch {
      // Best-effort persistence only.
    }
  }, [notApplicableIds, loadedKey, destinationKey]);

  const toggleItem = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleNotApplicable = (id: string) => {
    setNotApplicableIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getPercentage = (category: ReadinessCategory): number => {
    const items = READINESS_CHECKLISTS[category];
    const applicable = items.filter((item) => !notApplicableIds.has(item.id));
    if (applicable.length === 0) return 0;
    const completed = applicable.filter((item) => checkedIds.has(item.id)).length;
    return Math.round((completed / applicable.length) * 100);
  };

  return { checkedIds, notApplicableIds, toggleItem, toggleNotApplicable, getPercentage };
}
