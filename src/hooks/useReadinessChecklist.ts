import { useEffect, useState } from 'react';

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

const CHECKED_STORAGE_KEY = 'pivotpartner-readiness-checklist';
const NOT_APPLICABLE_STORAGE_KEY = 'pivotpartner-readiness-not-applicable';

function loadIdSet(key: string): Set<string> {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

export function useReadinessChecklist() {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => loadIdSet(CHECKED_STORAGE_KEY));
  // Items the user marked as not relevant to them (e.g. "Family / dependent
  // documents" for someone travelling alone) — excluded from both the
  // numerator and denominator of the percentage, per "completed applicable
  // items / total applicable items".
  const [notApplicableIds, setNotApplicableIds] = useState<Set<string>>(() =>
    loadIdSet(NOT_APPLICABLE_STORAGE_KEY)
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(CHECKED_STORAGE_KEY, JSON.stringify(Array.from(checkedIds)));
    } catch {
      // Best-effort persistence only — a private window or blocked storage
      // shouldn't break the checklist within this session.
    }
  }, [checkedIds]);

  useEffect(() => {
    try {
      window.localStorage.setItem(NOT_APPLICABLE_STORAGE_KEY, JSON.stringify(Array.from(notApplicableIds)));
    } catch {
      // Best-effort persistence only.
    }
  }, [notApplicableIds]);

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
