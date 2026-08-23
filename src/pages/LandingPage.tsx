import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Menu,
  X,
  ArrowRight,
  Sparkles,
  Globe,
  Briefcase,
  Home,
  Users,
  Stethoscope,
  Landmark,
  GraduationCap,
  HeartHandshake,
  MapPin,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';
import { QUICK_START_PROMPTS } from '../data/quickStartPrompts';
import ThemeToggle from '../components/ThemeToggle';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const PILLARS = [
  {
    phase: 'Move',
    name: 'Relocation',
    description: 'Plan the practical side of moving — documents, timelines, and what to settle first.',
    icon: Globe,
    accent: 'var(--primary-dark)',
  },
  {
    phase: 'Work',
    name: 'Career & Income',
    description: 'Explore local, remote, and freelance paths that fit your real skills and experience.',
    icon: Briefcase,
    accent: 'var(--accent-gold)',
  },
  {
    phase: 'Settle',
    name: 'Life Setup',
    description: 'Housing, healthcare, banking, and education — the essentials of a new country.',
    icon: Home,
    accent: 'var(--accent-terracotta)',
  },
  {
    phase: 'Belong',
    name: 'Community',
    description: 'Professional, expat, and local networks so you’re not rebuilding your life alone.',
    icon: Users,
    accent: 'var(--accent-indigo)',
  },
] as const;

const HOW_IT_WORKS = [
  { title: "Tell us what's changing", detail: 'Share your move — where, when, and what you do professionally.' },
  { title: 'Build your relocation and career profile', detail: 'PivotPartner organizes your background into a profile it can actually use.' },
  { title: 'Explore your options', detail: 'See local, remote, and freelance paths, plus what settling in involves.' },
  { title: 'Identify skill gaps and priorities', detail: 'Understand what transfers directly and what might need building.' },
  { title: 'Take your next best action', detail: 'One clear next step at a time, instead of an overwhelming checklist.' },
] as const;

const LIFE_SETUP_ITEMS = [
  { label: 'Housing', detail: 'Neighborhoods, rent expectations, and what to compare before you commit.', icon: Home },
  { label: 'Healthcare', detail: 'How local healthcare and insurance systems typically work.', icon: Stethoscope },
  { label: 'Banking', detail: 'Opening accounts and managing money across two countries.', icon: Landmark },
  { label: 'Education', detail: 'Schools and family services if you’re relocating with children.', icon: GraduationCap },
] as const;

const COMMUNITY_ITEMS = [
  { label: 'Professional communities', detail: 'People working in your field, in your new city.', icon: Briefcase },
  { label: 'Expat communities', detail: 'Others who’ve made a similar international move.', icon: Globe },
  { label: 'Women & family communities', detail: 'Groups built around the realities of relocating with family.', icon: HeartHandshake },
  { label: 'Local connections', detail: 'Everyday local groups and activities near you.', icon: MapPin },
] as const;

const FAQS = [
  {
    question: 'What is a trailing spouse?',
    answer:
      'A trailing spouse is a partner who relocates internationally because their spouse or partner accepted a job or assignment abroad. They often have to pause or rebuild their own career as part of the move.',
  },
  {
    question: 'How can a trailing spouse continue their career after relocating?',
    answer:
      'By identifying which skills and experience transfer directly, and comparing local employment, remote work, and freelance options against work authorization realities in the new country — rather than starting from a blank page.',
  },
  {
    question: 'Can trailing spouses work remotely?',
    answer:
      'Often, yes — many trailing spouses continue working for an employer in their home country or take on new remote roles. Remote work still has visa, tax, and work-authorization considerations that vary by country, which is worth verifying for your situation.',
  },
  {
    question: 'How can I find work after moving abroad?',
    answer:
      'Start by mapping your transferable skills against local demand, remote opportunities, and freelance or contract work. Understanding your work authorization status early narrows the search considerably.',
  },
  {
    question: 'Should I look for local, remote or freelance work?',
    answer:
      'It depends on your work authorization, industry, and how portable your current role is. Remote work preserves continuity if it’s available; local work builds in-country networks; freelance offers flexibility while you get settled. Most people end up considering all three.',
  },
  {
    question: 'What is an Employer of Record (EOR)?',
    answer:
      'An Employer of Record is a third-party organization that legally employs a worker on behalf of another company, often used to employ someone compliantly in a country where the hiring company has no legal entity. It’s one way remote employment across borders can work in practice.',
  },
  {
    question: 'How can I transition my career after relocation?',
    answer:
      'Treat it as a transition, not a restart: inventory your transferable skills, compare tech, non-tech, and hybrid paths in your new market, identify real skill gaps, and take one prioritized action at a time.',
  },
  {
    question: 'How can PivotPartner help with international relocation?',
    answer:
      'PivotPartner connects the parts of a relocation that are usually handled separately — your move, your career, your income options, your new-country setup, and your community — through one AI copilot that keeps them in context together.',
  },
] as const;

const WHO_FOR = ['Trailing spouses', 'Career changers', 'Remote professionals', 'International families'] as const;

const CAREER_WHERE = ['Tech', 'Non-tech', 'Hybrid'] as const;
const CAREER_HOW = ['Local', 'Remote', 'Freelance'] as const;

const DECISION_FLOW = ['Destination', 'Work options', 'Career', 'Income', 'Life setup', 'Community'] as const;

const NAV_LINKS = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Career', href: '#career' },
  { label: 'Relocation', href: '#relocation' },
  { label: 'Resources', href: '#faq' },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [heroInput, setHeroInput] = useState('');

  // The hero AI input is a real handoff into the product, not a decorative
  // mock-up: whatever the visitor types (or picks from a starter prompt)
  // travels into /app via router state, where App.tsx sends it through the
  // same useGroqChat()/Groq /api/chat path the rest of the app already uses.
  const startWithPrompt = (prompt: string) => {
    const trimmed = prompt.trim();
    navigate('/app', trimmed ? { state: { initialPrompt: trimmed } } : undefined);
  };

  const handleHeroSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    startWithPrompt(heroInput);
  };

  return (
    <div style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-body)' }}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:text-sm focus:font-semibold"
        style={{ backgroundColor: 'var(--primary)', color: '#fff' }}
      >
        Skip to main content
      </a>

      {/* ================================================================
          NAVIGATION
          ================================================================ */}
      <header
        className="sticky top-0 z-40 border-b"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-warm)' }}
      >
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4" aria-label="Primary">
          <Link to="/" className="text-lg font-bold tracking-tight" style={{ color: 'var(--text-strong)' }}>
            PivotPartner
          </Link>

          <ul className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-sm font-medium transition-colors hover:opacity-80"
                  style={{ color: 'var(--text-body)' }}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden items-center gap-3 md:flex">
            <ThemeToggle />
            <Link
              to="/login"
              className="text-sm font-medium transition-colors hover:opacity-80"
              style={{ color: 'var(--text-body)' }}
            >
              Log in
            </Link>
            <Link
              to="/get-started"
              className="rounded-md px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--primary-dark)' }}
            >
              Get started
            </Link>
          </div>

          {/* Mobile: theme toggle stays visible next to the menu button
              rather than hidden inside the collapsible panel, so switching
              themes doesn't require opening the nav. */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              type="button"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMobileMenuOpen((open) => !open)}
              style={{ color: 'var(--text-strong)' }}
            >
              {mobileMenuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
            </button>
          </div>
        </nav>

        {mobileMenuOpen && (
          <div
            id="mobile-nav"
            className="border-t px-6 py-4 md:hidden"
            style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}
          >
            <ul className="flex flex-col gap-4">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-body)' }}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-3">
              <Link to="/login" className="text-sm font-medium" style={{ color: 'var(--text-body)' }}>
                Log in
              </Link>
              <Link
                to="/get-started"
                className="inline-block rounded-md px-4 py-2 text-center text-sm font-semibold text-white"
                style={{ backgroundColor: 'var(--primary-dark)' }}
              >
                Get started
              </Link>
            </div>
          </div>
        )}
      </header>

      <main id="main-content">
        {/* ================================================================
            HERO — the AI input is the primary CTA; the H1 stays the clear
            SEO/GEO-focused headline above it.
            ================================================================ */}
        <section className="mx-auto max-w-6xl px-6 pb-16 pt-14 sm:pb-24 sm:pt-20" aria-labelledby="hero-heading">
          <div className="mx-auto max-w-3xl text-center">
            <h1
              id="hero-heading"
              className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl"
              style={{ color: 'var(--text-strong)' }}
            >
              AI Relocation &amp; Career Copilot for Trailing Spouses
            </h1>

            <p className="mt-4 text-xl font-medium" style={{ color: 'var(--primary-dark)' }}>
              Your life and career can travel with you.
            </p>

            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed" style={{ color: 'var(--text-body)' }}>
              One AI copilot for relocation, career, income, life setup, and community.
            </p>
          </div>

          {/* Primary CTA: a real input into the product, not a static mock-up.
              Submitting (or picking a starter prompt) hands the message to
              /app, where it's sent through the same Groq chat already used
              across the app — see App.tsx's initialPrompt effect. */}
          <form onSubmit={handleHeroSubmit} className="mx-auto mt-10 max-w-xl">
            <div
              className="flex items-center gap-3 rounded-md border-2 px-5 py-4 shadow-soft transition-colors focus-within:border-[var(--primary)]"
              style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}
            >
              <Sparkles size={20} className="shrink-0" style={{ color: 'var(--primary)' }} aria-hidden="true" />
              <label htmlFor="hero-ai-input" className="sr-only">
                Tell PivotPartner what&rsquo;s changing
              </label>
              <input
                id="hero-ai-input"
                type="text"
                value={heroInput}
                onChange={(e) => setHeroInput(e.target.value)}
                placeholder="Tell PivotPartner what's changing…"
                className="flex-1 text-base"
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
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--primary-dark)' }}
              >
                Start
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {QUICK_START_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => startWithPrompt(prompt)}
                  className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:border-[var(--primary)]"
                  style={{ borderColor: 'var(--border-warm)', color: 'var(--text-body)' }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </form>

          <div className="mt-6 text-center">
            <a
              href="#how-it-works"
              className="text-sm font-medium underline-offset-4 hover:underline"
              style={{ color: 'var(--text-muted)' }}
            >
              See how it works
            </a>
          </div>
        </section>

        {/* ================================================================
            DEFINITION — establishes the core term for readers and for
            AI-search / GEO before the rest of the page assumes it.
            ================================================================ */}
        <section className="mx-auto max-w-3xl px-6 pb-14 sm:pb-16" aria-labelledby="definition-heading">
          <h2
            id="definition-heading"
            className="text-xl font-bold sm:text-2xl"
            style={{ color: 'var(--text-strong)' }}
          >
            What does &ldquo;trailing spouse&rdquo; mean?
          </h2>
          <p className="mt-3 text-base leading-relaxed" style={{ color: 'var(--text-body)' }}>
            A <strong>trailing spouse</strong> is a partner who relocates internationally because their spouse or
            partner accepted a job or assignment abroad. It usually means pausing a career to support someone
            else&rsquo;s move — that&rsquo;s the part PivotPartner exists to change.
          </p>
        </section>

        {/* ================================================================
            WHO IT'S FOR
            ================================================================ */}
        <section
          className="border-y px-6 py-12 sm:py-14"
          style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}
          aria-labelledby="who-for-heading"
        >
          <div className="mx-auto max-w-3xl">
            <h2
              id="who-for-heading"
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Who is PivotPartner for?
            </h2>
            <ul className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
              {WHO_FOR.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 text-base font-semibold"
                  style={{ color: 'var(--text-strong)' }}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: 'var(--primary)' }}
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ================================================================
            PROBLEM
            ================================================================ */}
        <section
          className="border-y px-6 py-16 sm:py-20"
          style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}
          aria-labelledby="problem-heading"
        >
          <div className="mx-auto max-w-3xl">
            <h2 id="problem-heading" className="text-2xl font-bold sm:text-3xl" style={{ color: 'var(--text-strong)' }}>
              What happens to your career when you relocate?
            </h2>
            <p className="mt-4 text-lg font-medium leading-snug" style={{ color: 'var(--text-strong)' }}>
              One partner gets the opportunity. Both careers are supposed to come along.
            </p>
            <p className="mt-3 text-base leading-relaxed" style={{ color: 'var(--text-body)' }}>
              In practice, the partner who moves often leaves their job, steps away from a professional network,
              and has to work out whether they can legally work in the new country — usually after the move is
              already underway. PivotPartner starts that conversation earlier, and keeps it connected to
              everything else that&rsquo;s changing at once.
            </p>
          </div>
        </section>

        {/* ================================================================
            FOUR-PILLAR PRODUCT MODEL
            ================================================================ */}
        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20" aria-labelledby="pillars-heading">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="pillars-heading" className="text-2xl font-bold sm:text-3xl" style={{ color: 'var(--text-strong)' }}>
              One copilot. Your entire transition.
            </h2>
            <p className="mt-3 text-base leading-relaxed" style={{ color: 'var(--text-body)' }}>
              Relocation, career, income, and community aren&rsquo;t separate problems — they affect each other.
              PivotPartner treats them as one connected journey.
            </p>

            {/* MOVE → WORK → SETTLE → BELONG, at a glance */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              {PILLARS.map((pillar, index) => (
                <React.Fragment key={pillar.phase}>
                  <span
                    className="text-xs font-bold uppercase tracking-widest"
                    style={{ color: pillar.accent }}
                  >
                    {pillar.phase}
                  </span>
                  {index < PILLARS.length - 1 && (
                    <ArrowRight size={12} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* One continuous rail rather than a numbered/stepped list — a
              small accent dot marks each stage, not a numbered badge. */}
          <ol className="relative mx-auto mt-14 max-w-xl">
            <span
              className="absolute left-[5px] top-2 bottom-2 w-px"
              style={{ backgroundColor: 'var(--border-warm)' }}
              aria-hidden="true"
            />
            {PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <li key={pillar.name} className="relative flex gap-5 pb-10 last:pb-0">
                  <span
                    className="relative z-10 mt-2 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: pillar.accent }}
                    aria-hidden="true"
                  />
                  <div>
                    <span
                      className="block text-xs font-semibold uppercase tracking-wider"
                      style={{ color: pillar.accent }}
                    >
                      {pillar.phase}
                    </span>
                    <h3
                      className="mt-1 flex items-center gap-2 text-lg font-semibold"
                      style={{ color: 'var(--text-strong)' }}
                    >
                      <Icon size={16} style={{ color: pillar.accent }} aria-hidden="true" />
                      {pillar.name}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      {pillar.description}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* ================================================================
            CAREER
            ================================================================ */}
        <section
          id="career"
          className="border-y px-6 py-16 sm:py-20"
          style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}
          aria-labelledby="career-heading"
        >
          <div className="mx-auto max-w-3xl">
            <h2 id="career-heading" className="text-2xl font-bold sm:text-3xl" style={{ color: 'var(--accent-gold)' }}>
              Your career doesn&rsquo;t have to relocate backwards.
            </h2>
            <p className="mt-4 text-base leading-relaxed" style={{ color: 'var(--text-body)' }}>
              PivotPartner compares career paths against how you&rsquo;d actually work in your next market.
            </p>

            <div className="mt-8 space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Where you work
                </p>
                <p className="mt-1.5 text-lg font-semibold" style={{ color: 'var(--accent-gold-strong)' }}>
                  {CAREER_WHERE.map((tag, index) => (
                    <React.Fragment key={tag}>
                      {tag}
                      {index < CAREER_WHERE.length - 1 && (
                        <span className="mx-2.5" style={{ color: 'var(--text-muted)' }} aria-hidden="true">
                          &middot;
                        </span>
                      )}
                    </React.Fragment>
                  ))}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  How you work
                </p>
                <p className="mt-1.5 text-lg font-semibold" style={{ color: 'var(--accent-gold-strong)' }}>
                  {CAREER_HOW.map((tag, index) => (
                    <React.Fragment key={tag}>
                      {tag}
                      {index < CAREER_HOW.length - 1 && (
                        <span className="mx-2.5" style={{ color: 'var(--text-muted)' }} aria-hidden="true">
                          &middot;
                        </span>
                      )}
                    </React.Fragment>
                  ))}
                </p>
              </div>
            </div>

            <p className="mt-6 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Along the way: transferable skills, realistic career paths, honest skill gaps, and one next action —
              not a generic checklist. PivotPartner doesn&rsquo;t guarantee jobs or generate fake listings.
            </p>
            <Link
              to="/app"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold"
              style={{ color: 'var(--accent-gold-strong)' }}
            >
              Explore career paths
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </section>

        {/* ================================================================
            RELOCATION
            ================================================================ */}
        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20" id="relocation" aria-labelledby="relocation-heading">
          <div className="mx-auto max-w-3xl">
            <h2 id="relocation-heading" className="text-2xl font-bold sm:text-3xl" style={{ color: 'var(--primary-dark)' }}>
              Move with a plan.
            </h2>

            <div className="mt-5 inline-flex items-center gap-3 rounded-md border px-4 py-3" style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}>
              <span
                className="rounded-md px-3 py-1.5 text-sm font-semibold"
                style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary-dark)' }}
              >
                Your origin
              </span>
              <ArrowRight size={16} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
              <span
                className="rounded-md px-3 py-1.5 text-sm font-semibold"
                style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary-dark)' }}
              >
                Your destination
              </span>
            </div>

            <p className="mt-3 text-base leading-relaxed" style={{ color: 'var(--text-body)' }}>
              Every recommendation is grounded in the actual move you tell PivotPartner about — work eligibility
              considerations, housing, documents, healthcare, banking, and education, organized around where
              you&rsquo;re actually going, not a generic checklist.
            </p>

            <div
              className="mt-6 flex items-start gap-3 rounded-md border p-4"
              style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}
            >
              <ShieldCheck size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--primary-dark)' }} aria-hidden="true" />
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Work authorization and immigration rules vary by country and change over time. PivotPartner helps
                you understand what to consider — always verify specific legal, immigration, or tax questions with
                a qualified professional.
              </p>
            </div>
          </div>
        </section>

        {/* ================================================================
            LIFE SETUP
            ================================================================ */}
        <section
          className="border-y px-6 py-16 sm:py-20"
          style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}
          aria-labelledby="life-setup-heading"
        >
          <div className="mx-auto max-w-6xl">
            <h2
              id="life-setup-heading"
              className="text-2xl font-bold sm:text-3xl"
              style={{ color: 'var(--accent-terracotta)' }}
            >
              Build your life in the new country.
            </h2>

            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {LIFE_SETUP_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label}>
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-md"
                      style={{ backgroundColor: 'var(--accent-terracotta-tint)', color: 'var(--accent-terracotta-strong)' }}
                    >
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <h3 className="mt-3 text-base font-semibold" style={{ color: 'var(--text-strong)' }}>
                      {item.label}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      {item.detail}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ================================================================
            COMMUNITY
            ================================================================ */}
        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20" aria-labelledby="community-heading">
          <h2 id="community-heading" className="text-2xl font-bold sm:text-3xl" style={{ color: 'var(--accent-indigo)' }}>
            Don&rsquo;t rebuild your network alone.
          </h2>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {COMMUNITY_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label}>
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-md"
                    style={{ backgroundColor: 'var(--accent-indigo-tint)', color: 'var(--accent-indigo-strong)' }}
                  >
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 text-base font-semibold" style={{ color: 'var(--text-strong)' }}>
                    {item.label}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    {item.detail}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ================================================================
            HOW IT WORKS
            ================================================================ */}
        <section
          id="how-it-works"
          className="border-y px-6 py-16 sm:py-20"
          style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}
          aria-labelledby="how-it-works-heading"
        >
          <div className="mx-auto max-w-2xl">
            <h2
              id="how-it-works-heading"
              className="text-2xl font-bold sm:text-3xl"
              style={{ color: 'var(--text-strong)' }}
            >
              How PivotPartner works
            </h2>

            <ol className="mt-10 space-y-6">
              {HOW_IT_WORKS.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary-dark)' }}
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>
                      {step.title}
                    </p>
                    <p className="mt-0.5 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      {step.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ================================================================
            AI COPILOT
            ================================================================ */}
        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20" aria-labelledby="ai-copilot-heading">
          <div className="mx-auto max-w-3xl">
            <h2
              id="ai-copilot-heading"
              className="text-2xl font-bold sm:text-3xl"
              style={{ color: 'var(--text-strong)' }}
            >
              One conversation. Multiple decisions.
            </h2>
            <p className="mt-5 text-base leading-relaxed" style={{ color: 'var(--text-body)' }}>
              Relocation decisions are interconnected — your destination affects your work options, your work
              options affect your income plan, and all of it affects how you settle in. Asking about each one in
              isolation loses that context.
            </p>

            <blockquote
              className="mt-6 border-l-2 pl-4 text-base italic"
              style={{ borderColor: 'var(--primary)', color: 'var(--text-strong)' }}
            >
              &ldquo;I&rsquo;m moving to a new country and want to continue my career.&rdquo;
            </blockquote>

            <p className="mt-6 text-base leading-relaxed" style={{ color: 'var(--text-body)' }}>
              From one intent like that, PivotPartner connects the decisions that usually get asked about
              separately:
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-3" role="list" aria-label="How PivotPartner connects your decisions">
              {DECISION_FLOW.map((node, index) => (
                <React.Fragment key={node}>
                  <span
                    role="listitem"
                    className="rounded-md border px-3 py-1.5 text-sm font-medium"
                    style={{ borderColor: 'var(--border-warm)', color: 'var(--text-strong)' }}
                  >
                    {node}
                  </span>
                  {index < DECISION_FLOW.length - 1 && (
                    <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </section>

        {/* ================================================================
            FAQ
            ================================================================ */}
        <section
          id="faq"
          className="border-y px-6 py-16 sm:py-20"
          style={{ borderColor: 'var(--border-warm)', backgroundColor: 'var(--surface)' }}
          aria-labelledby="faq-heading"
        >
          <div className="mx-auto max-w-3xl">
            <h2 id="faq-heading" className="text-2xl font-bold sm:text-3xl" style={{ color: 'var(--text-strong)' }}>
              Frequently asked questions
            </h2>

            <dl className="mt-8 divide-y" style={{ borderColor: 'var(--border-warm)' }}>
              {FAQS.map((faq, index) => {
                const isOpen = openFaqIndex === index;
                const answerId = `faq-answer-${index}`;
                return (
                  <div key={faq.question} className="border-t first:border-t-0" style={{ borderColor: 'var(--border-warm)' }}>
                    <dt>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={answerId}
                        onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                        className="flex w-full items-center justify-between gap-4 py-5 text-left"
                      >
                        <span className="text-base font-semibold" style={{ color: 'var(--text-strong)' }}>
                          {faq.question}
                        </span>
                        <ChevronDown
                          size={18}
                          aria-hidden="true"
                          className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          style={{ color: 'var(--text-muted)' }}
                        />
                      </button>
                    </dt>
                    <dd
                      id={answerId}
                      hidden={!isOpen}
                      className="pb-5 text-sm leading-relaxed"
                      style={{ color: 'var(--text-body)' }}
                    >
                      {faq.answer}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </section>

        {/* ================================================================
            FINAL CTA
            ================================================================ */}
        <section className="mx-auto max-w-6xl px-6 py-20 text-center sm:py-24" aria-labelledby="final-cta-heading">
          <h2 id="final-cta-heading" className="text-3xl font-bold sm:text-4xl" style={{ color: 'var(--text-strong)' }}>
            Your next chapter starts here.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed" style={{ color: 'var(--text-body)' }}>
            Your partner may be moving for the opportunity. Your career should move forward too.
          </p>
          <Link
            to="/app"
            className="mt-8 inline-flex items-center gap-2 rounded-md px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--primary-dark)' }}
          >
            Start your transition
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </main>

      {/* ================================================================
          FOOTER
          ================================================================ */}
      <footer className="border-t px-6 py-10" style={{ borderColor: 'var(--border-warm)' }}>
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
              PivotPartner
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              An AI relocation and career copilot for trailing spouses.
            </p>
          </div>
          <ul className="flex flex-wrap items-center justify-center gap-6">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </footer>

      {/* FAQPage structured data, generated from the same FAQS array rendered above */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQS.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: faq.answer,
              },
            })),
          }),
        }}
      />
    </div>
  );
};

export default LandingPage;
