import React, { useState } from 'react';
import { Target, ChevronDown, ChevronUp } from 'lucide-react';
import { useReadinessChecklist, READINESS_CHECKLISTS } from '../hooks/useReadinessChecklist';
// Note: useReadinessChecklist() still exposes notApplicableIds/toggleNotApplicable
// (unused here) — intentionally left as-is in the hook per "without
// changing anything else"; this component just no longer surfaces that
// control in the UI.

// Relocation Readiness represents basic travel + relocation document
// preparedness ONLY — driven exclusively by the "relocation" checklist.
// Housing, Finances, Community, Healthcare, and Career deliberately do not
// contribute to this score (Career already has its own real readiness via
// Career & Income; the others may get their own independent checklists
// later, but none of them feed this number).
const RelocationReadiness: React.FC = () => {
  const { checkedIds, toggleItem, getPercentage } = useReadinessChecklist();
  const [expanded, setExpanded] = useState(true);

  const percentage = getPercentage('relocation');
  const items = READINESS_CHECKLISTS.relocation;

  return (
    <div className="bg-[#26c485]/5 border border-[#26c485]/20 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Relocation Readiness
          </p>
          <p className="text-4xl font-bold text-[var(--primary)]">{percentage}%</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-light)' }}>
            Based on your relocation checklist — self-reported, not verified by PivotPartner.
          </p>
        </div>
        <Target size={40} className="text-[var(--primary)]" aria-hidden="true" />
      </div>

      <div className="w-full bg-[var(--surface-2)] rounded-md h-3 mb-4">
        <div className="bg-[var(--primary)] h-3 rounded-md transition-all" style={{ width: `${percentage}%` }} />
      </div>

      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex items-center gap-1 text-xs font-medium underline"
        style={{ color: 'var(--text-muted)' }}
      >
        {expanded ? 'Hide checklist' : 'View checklist'}
        {expanded ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
      </button>

      {expanded && (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <label
                className="flex items-center gap-2 text-sm cursor-pointer"
                style={{ color: 'var(--text-body)' }}
              >
                <input
                  type="checkbox"
                  checked={checkedIds.has(item.id)}
                  onChange={() => toggleItem(item.id)}
                  className="h-4 w-4 shrink-0"
                />
                {item.label}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default RelocationReadiness;
