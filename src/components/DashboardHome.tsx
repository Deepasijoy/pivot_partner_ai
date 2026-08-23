import React, { useState } from 'react';
import type { ResumeProfile, PillarTab } from '../types';
import { Sparkles, ArrowUpRight, ChevronRight, Globe, Briefcase, Home, Users } from 'lucide-react';
import { QUICK_START_PROMPTS } from '../data/quickStartPrompts';

interface DashboardHomeProps {
  origin: string;
  destination: string;
  parsedProfile: ResumeProfile | null;
  isLoading: boolean;
  onNavigate: (tab: PillarTab) => void;
  onSendPrompt: (text: string) => void;
}

interface JourneyStage {
  phase: string;
  name: string;
  tab: PillarTab;
  status: string;
  icon: typeof Globe;
  accent: string;
}

function buildStages(origin: string, destination: string, parsedProfile: ResumeProfile | null): JourneyStage[] {
  return [
    {
      phase: 'Move',
      name: 'Relocation',
      tab: 'relocation',
      status: origin.trim() && destination.trim() ? `${origin} → ${destination}` : 'Add your move details',
      icon: Globe,
      accent: 'var(--primary-dark)',
    },
    {
      phase: 'Work',
      name: 'Career & Income',
      tab: 'career',
      status: parsedProfile
        ? `Profile analyzed · ${parsedProfile.skills.length} skills identified`
        : 'Upload your resume to begin',
      icon: Briefcase,
      accent: 'var(--accent-gold)',
    },
    {
      phase: 'Settle',
      name: 'Life Setup',
      tab: 'life',
      status: 'Explore housing, healthcare & banking',
      icon: Home,
      accent: 'var(--accent-terracotta)',
    },
    {
      phase: 'Belong',
      name: 'Community',
      tab: 'community',
      status: 'Find your professional & local network',
      icon: Users,
      accent: 'var(--accent-indigo)',
    },
  ];
}

function getNextBestAction(origin: string, destination: string, parsedProfile: ResumeProfile | null) {
  if (!origin.trim() || !destination.trim()) {
    return {
      title: 'Complete your relocation profile',
      detail: "Tell PivotPartner where you're moving from and to, so it can ground every answer in your real move.",
      tab: 'relocation' as PillarTab,
      icon: Globe,
    };
  }

  if (!parsedProfile) {
    return {
      title: 'Upload your resume',
      detail: 'So PivotPartner can match your real skills and experience to career paths — not generic advice.',
      tab: 'career' as PillarTab,
      icon: Briefcase,
    };
  }

  return {
    title: 'Review your skill gaps',
    detail: 'Your profile is in. See what already matches remote and freelance roles, and what to build next.',
    tab: 'career' as PillarTab,
    icon: Briefcase,
  };
}

const DashboardHome: React.FC<DashboardHomeProps> = ({
  origin,
  destination,
  parsedProfile,
  isLoading,
  onNavigate,
  onSendPrompt,
}) => {
  const [inputValue, setInputValue] = useState('');

  const stages = buildStages(origin, destination, parsedProfile);
  const nextAction = getNextBestAction(origin, destination, parsedProfile);
  const NextActionIcon = nextAction.icon;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;
    onSendPrompt(trimmed);
    setInputValue('');
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      {/* Hero */}
      <div className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          PivotPartner
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold leading-tight" style={{ color: 'var(--text-strong)' }}>
          Your next chapter starts here.
        </h1>
        <p className="mt-3 text-base leading-relaxed" style={{ color: 'var(--text-body)' }}>
          Navigate your move. Protect your career. Rebuild your life — with an AI copilot.
        </p>
      </div>

      {/* AI-first contextual input */}
      <form onSubmit={handleSubmit} className="mb-12">
        <div
          className="flex items-center gap-3 rounded-md border px-4 py-3 transition-colors focus-within:border-[var(--primary)]"
          style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}
        >
          <Sparkles size={18} className="shrink-0" style={{ color: 'var(--primary)' }} aria-hidden="true" />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Tell PivotPartner what's changing..."
            disabled={isLoading}
            className="flex-1 text-sm disabled:opacity-50"
            style={{
              border: 'none',
              background: 'transparent',
              padding: 0,
              boxShadow: 'none',
              color: 'var(--text-strong)',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            aria-label="Send to PivotPartner"
            className="shrink-0 rounded-md p-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: 'var(--primary-dark)' }}
          >
            <ArrowUpRight size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_START_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={isLoading}
              onClick={() => onSendPrompt(prompt)}
              className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 hover:border-[var(--primary)]"
              style={{ borderColor: 'var(--border-warm)', color: 'var(--text-body)' }}
            >
              {prompt}
            </button>
          ))}
        </div>
      </form>

      {/* Journey */}
      <div className="mb-12">
        <h2 className="mb-6 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Your Journey
        </h2>

        <ol>
          {stages.map((stage, index) => {
            const Icon = stage.icon;
            const isLast = index === stages.length - 1;

            return (
              <li key={stage.tab} className="relative">
                {!isLast && (
                  <span
                    className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px"
                    style={{ backgroundColor: 'var(--border-warm)' }}
                    aria-hidden="true"
                  />
                )}

                <button
                  type="button"
                  onClick={() => onNavigate(stage.tab)}
                  className="group flex w-full items-start gap-4 py-3 text-left"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border"
                    style={{ borderColor: stage.accent, color: stage.accent }}
                  >
                    <Icon size={15} aria-hidden="true" />
                  </span>

                  <span className="flex-1 pt-1">
                    <span className="block text-xs font-semibold uppercase tracking-wider" style={{ color: stage.accent }}>
                      {stage.phase}
                    </span>
                    <span
                      className="mt-0.5 flex items-center gap-1 text-base font-semibold"
                      style={{ color: 'var(--text-strong)' }}
                    >
                      {stage.name}
                      <ChevronRight
                        size={16}
                        aria-hidden="true"
                        className="-translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                      />
                    </span>
                    <span className="mt-0.5 block text-sm" style={{ color: 'var(--text-muted)' }}>
                      {stage.status}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Next best action */}
      <div className="rounded-md border p-5" style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Next best action
        </p>

        <div className="mt-3 flex items-start gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary-dark)' }}
          >
            <NextActionIcon size={17} aria-hidden="true" />
          </span>

          <div className="flex-1">
            <p className="text-base font-semibold" style={{ color: 'var(--text-strong)' }}>
              {nextAction.title}
            </p>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {nextAction.detail}
            </p>

            <button
              type="button"
              onClick={() => onNavigate(nextAction.tab)}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ color: 'var(--primary-dark)' }}
            >
              Continue
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardHome;
