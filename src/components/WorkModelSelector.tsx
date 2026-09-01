import React, { useState } from 'react';
import type { WorkModel } from '../types';

interface WorkModelSelectorProps {
  onContinue: (models: WorkModel[]) => void;
}

const OPTIONS: { id: WorkModel; label: string }[] = [
  { id: 'local', label: 'Local' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'remote', label: 'Remote' },
  { id: 'freelance', label: 'Freelance / Consulting' },
];

const WorkModelSelector: React.FC<WorkModelSelectorProps> = ({ onContinue }) => {
  const [selected, setSelected] = useState<WorkModel[]>([]);

  const toggle = (id: WorkModel) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((model) => model !== id) : [...prev, id]));
  };

  return (
    <div className="rounded-lg border p-6" style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}>
      <h3 className="text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
        How would you like to work?
      </h3>
      <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
        Select one or more — you can compare across all of them.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {OPTIONS.map((option) => {
          const isSelected = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => toggle(option.id)}
              aria-pressed={isSelected}
              className="rounded-md border px-4 py-2 text-sm font-medium transition-colors"
              style={
                isSelected
                  ? { borderColor: 'var(--primary-dark)', backgroundColor: 'var(--primary-light)', color: 'var(--primary-dark)' }
                  : { borderColor: 'var(--border-warm)', color: 'var(--text-body)' }
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={selected.length === 0}
        onClick={() => onContinue(selected)}
        className="mt-5 rounded-md px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ backgroundColor: 'var(--primary-dark)' }}
      >
        Compare Opportunities
      </button>
    </div>
  );
};

export default WorkModelSelector;
