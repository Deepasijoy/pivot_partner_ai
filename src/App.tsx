import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import type { ResumeProfile, CopilotMessage, AppTab, PillarTab, PreferredWorkModel, WorkModel } from './types'
import Sidebar from './components/SideBar'
import TabNavigation from './components/TabNavigation'
import JobMatcherTab from './components/JobMatcherTab'
import ThemeToggle from './components/ThemeToggle'
import DashboardHome from './components/DashboardHome'
import RelocationReadiness from './components/RelocationReadiness'
import HousingResources from './components/HousingResources'
import CommunityResources from './components/CommunityResources'
import { useGroqChat } from './hooks/useGroqChat'
import { isActionableJobIntent, isActionableRelocationIntent } from './utils/jobIntentDetection'
import type { JobFetchResult } from './services/jobService'
import { jobsForCareerGuidance } from './services/jobService'
import { matchJobsForUser, generateCareerPaths, mergeCareerPathSkillGaps } from './services/matchingService'
import { buildAiContext } from './services/aiContextService'
import { INITIAL_CAREER_SEARCH_STATE, type CareerSearchState } from './components/JobMatcherTab'
import { COUNTRIES } from './data/countries'
import { useAuth } from './contexts/AuthContext'
import { Stethoscope, Landmark, GraduationCap, LogOut, MessageCircle, X } from 'lucide-react'
import './styles/theme.css'

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard')
  // /app is intentionally not gated — user/signOut are only used to show an
  // optional Logout control for visitors who did sign in, per the product
  // decision to keep the dashboard open for Product Hunt exploration.
  const { user, signOut } = useAuth()

  const [parsedProfile, setParsedProfile] =
    useState<ResumeProfile | null>(null)
  const [origin, setOrigin] = useState('')
  // Destination is explicit: a country the user selects (never guessed
  // from free text) plus a free-text city/region within it — see
  // locationService.ts's resolveDestinationFromParts. `destination` below
  // is a derived display string, kept for every existing consumer that
  // only ever needed a plain string (RelocationReadiness, HousingResources,
  // CommunityResources, aiContextService, the journey-status text) — none
  // of them need to change.
  const [destinationCountryCode, setDestinationCountryCode] = useState('')
  const [destinationCountryName, setDestinationCountryName] = useState('')
  const [destinationCity, setDestinationCity] = useState('')
  const destination = [destinationCity.trim(), destinationCountryName.trim()].filter(Boolean).join(', ')
  const [relocationDate, setRelocationDate] = useState('')
  // Relocation-profile fields restored to the dashboard (previously only
  // origin/destination/relocationDate existed, on the Relocation tab).
  // Same state mechanism as the fields above — not a separate profile system.
  const [workSituation, setWorkSituation] = useState('')
  const [preferredWorkModel, setPreferredWorkModel] = useState<PreferredWorkModel | ''>('')
  // Mirrors the canonical job-fetch result JobMatcherTab already owns and
  // already passes to CareerRecommendations/SkillAnalysis — reported up
  // here purely so the AI context can reference the same opportunities,
  // not to run a second fetch or duplicate scoring.
  const [careerJobs, setCareerJobs] = useState<JobFetchResult | null>(null)
  const [careerWorkModels, setCareerWorkModels] = useState<WorkModel[]>([])
  // Everything else Career & Income needs to remember for a visit (selected
  // work models, resolved destination, Local/Remote search results) —
  // lifted here so it survives the user navigating to another tab and back.
  // JobMatcherTab is only rendered while activeTab === 'career' (below), so
  // it unmounts on every other tab; App itself never does, which is what
  // actually fixes the "leaving the tab resets everything" bug.
  const [careerSearchState, setCareerSearchState] = useState<CareerSearchState>(INITIAL_CAREER_SEARCH_STATE)
  const updateCareerSearchState = useCallback((patch: Partial<CareerSearchState>) => {
    setCareerSearchState((prev) => ({ ...prev, ...patch }))
  }, [])
  // "Check work eligibility" AI Priority — toggles a Launching soon notice
  // rather than inventing eligibility information.
  const [showWorkEligibilityNotice, setShowWorkEligibilityNotice] = useState(false)
  // Below the lg breakpoint, the AI copilot moves from a permanent stacked
  // block into a floating button + overlay sheet — same Sidebar instance,
  // same shared chat state, just a different container. Unused at lg+,
  // where the existing inline sidebar layout is unchanged.
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false)

  // Single source of truth for the conversation — shared by the sidebar
  // chat panel and the dashboard's contextual AI input, both backed by the
  // same existing Groq /api/chat call in chatService.ts.
  const { messages, isLoading, sendPrompt, pushMessage } = useGroqChat()

  // If the visitor arrived from the landing page's hero AI input, it hands
  // off the prompt they typed via router state — send it once on mount so
  // the "AI interaction" on the landing page is a real handoff into this
  // same conversation, not a decorative dead end. A plain /app visit has no
  // location.state, so this is a no-op for the normal app entry point.
  const location = useLocation()
  const initialPromptSent = useRef(false)
  // Guards the one real career-analysis chat message posted once actual
  // job-matched data first becomes available for the current resume (see
  // handleJobsResolved below) — reset per new resume in handleProfileParsed
  // so re-uploading a different resume gets its own follow-up message.
  const careerAnalysisSent = useRef(false)
  // The actual scrollable element for pillar tab content (see the
  // overflow-y-auto div below) — passed down so JobMatcherTab's "Analyze
  // Skill Gap" action can scroll it directly via scrollTo/scrollTop instead
  // of relying on scrollIntoView, which doesn't reliably reach through the
  // overflow-hidden flex wrappers around it in this layout.
  const careerScrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const state = location.state as { initialPrompt?: string } | null
    if (state?.initialPrompt && !initialPromptSent.current) {
      initialPromptSent.current = true
      handleUserPrompt(state.initialPrompt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goToPillar = (tab: PillarTab) => setActiveTab(tab)

  // Stable-ish reference so JobMatcherTab's fetch effect (which lists this
  // in its dependency array) doesn't re-run beyond what parsedProfile
  // already triggers there directly.
  //
  // Also posts the one real, honest post-analysis chat summary — reusing
  // the exact same matching/skill-gap engine (matchJobsForUser,
  // generateCareerPaths, mergeCareerPathSkillGaps) that CareerRecommendations
  // and SkillAnalysis already use, fed by the same canonical job-fetch
  // result — so the chat is never out of sync with the dashboard, and never
  // invents a matched-skills count or readiness score.
  const handleJobsResolved = useCallback((result: JobFetchResult, models: WorkModel[]) => {
    setCareerJobs(result)
    setCareerWorkModels(models)

    if (!parsedProfile || careerAnalysisSent.current) return

    const matchedJobs = matchJobsForUser(parsedProfile, jobsForCareerGuidance(result.jobs))
    const paths = generateCareerPaths(parsedProfile.skills, matchedJobs, parsedProfile.likelyRole, parsedProfile.industries)
    // Skips the honest "no relevant freelance opportunity" placeholder
    // (Step D) — announcing it as "Top match: Freelance & Consulting — 0%
    // fit" would be exactly the kind of fabricated-confidence message this
    // pass is fixing elsewhere. If every generated path is unavailable,
    // there's nothing genuine to announce, so the summary is skipped.
    const topPath = paths.find((path) => !path.isUnavailable)
    if (!topPath) return

    careerAnalysisSent.current = true

    const gaps = mergeCareerPathSkillGaps(paths)
    const gapsClause =
      gaps.length > 0
        ? `Skills to strengthen: ${gaps.map((gap) => gap.skill.name).join(', ')}`
        : "No major skill gaps — you're well-positioned for your top match."

    const aiMsg: CopilotMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `Career analysis complete!

Top match: ${topPath.title} — ${topPath.matchPercentage}% fit
${gapsClause}

Open Career & Income to see your full skill-gap breakdown and career paths.`,
      timestamp: new Date(),
    }

    pushMessage(aiMsg)
  }, [parsedProfile, pushMessage])

  // Structured context handed to Groq alongside each prompt — what
  // PivotPartner already knows (relocation details, career profile, the
  // same canonical job opportunities Career & Income shows), so the AI
  // doesn't re-ask for information already collected.
  const buildContext = () =>
    buildAiContext({
      origin,
      destination,
      moveTiming: relocationDate,
      workSituation,
      preferredWorkModel,
      profile: parsedProfile,
      careerJobs,
      careerWorkModels,
    })

  // Intercepts prompts from the sidebar chat and the dashboard's contextual
  // AI input before they reach Groq. Actionable job-seeking intent (see
  // jobIntentDetection.ts) short-circuits the normal AI round-trip and
  // guides the user straight to the existing resume-upload/parser flow —
  // reusing the same pushMessage + activeTab mechanism handleQuickAction
  // already uses below, rather than introducing new state or routing.
  // Once a resume is already on file, fall through to the normal answer.
  const handleUserPrompt = (text: string) => {
    if (!parsedProfile && isActionableJobIntent(text)) {
      const userMsg: CopilotMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        timestamp: new Date(),
      }
      pushMessage(userMsg)

      setTimeout(() => {
        const aiMsg: CopilotMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: "To help me match opportunities to your experience, let's start with your resume.",
          timestamp: new Date(),
          action: 'open-resume-parser',
        }
        pushMessage(aiMsg)
      }, 500)

      return
    }

    // Same short-circuit shape as the job-intent branch above, for
    // move-planning intent (see isActionableRelocationIntent) — routes to
    // the existing Relocation tab instead of a generic Groq round-trip.
    if (isActionableRelocationIntent(text)) {
      const userMsg: CopilotMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        timestamp: new Date(),
      }
      pushMessage(userMsg)

      setTimeout(() => {
        const aiMsg: CopilotMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: "Let's start with your move — here's your Relocation plan.",
          timestamp: new Date(),
        }
        pushMessage(aiMsg)
        goToPillar('relocation')
      }, 500)

      return
    }

    sendPrompt(text, buildContext())
  }

  // Dashboard-only wrapper around handleUserPrompt: below the lg breakpoint
  // (1024px, matching the existing lg: classes below) the chat panel isn't
  // on screen unless isMobileChatOpen is true, so a Dashboard-submitted
  // prompt would otherwise update the shared chat state with no visible
  // surface to show it. Opens the existing mobile sheet so the exchange is
  // visible there; handleUserPrompt itself is untouched, so the desktop
  // Sidebar and its existing quick actions behave exactly as before.
  const handleDashboardPrompt = (text: string) => {
    if (window.innerWidth < 1024) {
      setIsMobileChatOpen(true)
    }
    handleUserPrompt(text)
  }

  // Quick actions from Sidebar
  const handleQuickAction = (
    action: 'jobs' | 'tax' | 'resume'
  ) => {
    if (action === 'jobs') {
      setActiveTab('career')

      const userMsg: CopilotMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: 'Show Remote Jobs',
        timestamp: new Date(),
      }

      pushMessage(userMsg)

      setTimeout(() => {
        const aiMsg: CopilotMessage = {
          id: (Date.now() + 100).toString(),
          role: 'assistant',
          content: parsedProfile
            ? `Perfect! Let's look at opportunities that fit your profile.

Your profile:
• ${parsedProfile.yearsExperience} years of experience
• Seniority: ${parsedProfile.seniority || 'Professional Level'}
• Industries: ${parsedProfile.industries?.join(', ') || 'Various'}
• Top skills: ${
                parsedProfile.skills
                  ?.slice(0, 3)
                  .map((s) => s.name)
                  .join(', ') || 'Your professional skills'
              }

We'll compare local, remote, and freelance opportunities, salary potential, and work eligibility.

Use the Career & Income tab to explore your options.`
            : `Let's find the right opportunities for you.

First, upload your resume in the Career & Income tab so I can extract your skills, analyze your experience, identify suitable career paths, and compare local vs remote opportunities.

Let's get started!`,
          timestamp: new Date(),
        }

        pushMessage(aiMsg)
      }, 800)
    }

    if (action === 'tax') {
      setActiveTab('relocation')

      const userMsg: CopilotMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: 'Check Relocation & Tax',
        timestamp: new Date(),
      }

      pushMessage(userMsg)

      setTimeout(() => {
        const aiMsg: CopilotMessage = {
          id: (Date.now() + 100).toString(),
          role: 'assistant',
          content: `Let's look at the financial side of your relocation.

I'll help you think through local vs remote income, banking, cost of living, housing costs, tax considerations, cross-border work considerations, and EOR possibilities.

For specific tax or legal decisions, we'll flag where professional advice may be required.

Tell me your destination and expected income to start the analysis.`,
          timestamp: new Date(),
        }

        pushMessage(aiMsg)
      }, 800)
    }

    if (action === 'resume') {
      setActiveTab('career')

      const userMsg: CopilotMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: 'Adapt My Resume',
        timestamp: new Date(),
      }

      pushMessage(userMsg)

      setTimeout(() => {
        const aiMsg: CopilotMessage = {
          id: (Date.now() + 100).toString(),
          role: 'assistant',
          content: parsedProfile
            ? `I can help reposition your profile for the global market.

Your current strengths include ${
                parsedProfile.skills
                  ?.slice(0, 3)
                  .map((s) => s.name)
                  .join(', ') || 'your professional skills'
              }, ${parsedProfile.yearsExperience} years of experience, and ${
                parsedProfile.industries?.join(', ') ||
                'your professional background'
              }.

I'll help emphasize transferable skills, international experience, remote-friendly capabilities, measurable achievements, and target-role keywords.

Open Career & Income to continue.`
            : `Let's optimize your professional profile for the global market.

Upload your resume in the Career & Income tab and I'll help identify transferable skills, remote-friendly experience, career pivot opportunities, skills gaps, and target roles.

Let's make your experience travel with you!`,
          timestamp: new Date(),
        }

        pushMessage(aiMsg)
      }, 800)
    }
  }

  // Called when JobMatcherTab successfully analyzes a resume. Reports only
  // facts already known at parse time (no job-matched data exists yet —
  // that requires a work-model choice and the canonical job fetch, handled
  // in handleJobsResolved below once it's real). Resets the one-shot
  // career-analysis guard so a newly uploaded resume gets its own honest
  // follow-up once its real analysis is ready.
  const handleProfileParsed = (profile: ResumeProfile) => {
    setParsedProfile(profile)
    careerAnalysisSent.current = false

    const allSkills = profile.skills || []

    const aiMsg: CopilotMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `Resume analyzed successfully!

Your career profile:
• Years of experience: ${profile.yearsExperience}
• Seniority: ${profile.seniority || 'Professional'}
• Industries: ${profile.industries?.join(', ') || 'Various'}
• Skills identified: ${allSkills.length}

Next: choose how you'd like to work (local, remote, or freelance) in Career & Income — I'll match your profile against real opportunities and share your actual skill-gap analysis once that's ready.

Your career can travel with you.`,
      timestamp: new Date(),
    }

    pushMessage(aiMsg)
  }

  // "Upload Different Resume" in Career & Income — clears the profile this
  // state lives in (see handleProfileParsed above); JobMatcherTab clears its
  // own lifted search state (work models, job results) itself.
  const handleResetProfile = () => {
    setParsedProfile(null)
  }

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-app)' }}>
      {/* Header */}
      <div
        className="border-b px-6 py-4 shadow-soft flex items-center justify-between"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-warm)' }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className="max-w-full text-left"
          aria-label="Go to dashboard"
        >
          <div className="flex items-baseline gap-3 mb-1">
            <h1 className="text-xl font-bold text-[var(--primary)] tracking-tight sm:text-3xl">
              PivotPartner AI
            </h1>

            <span className="text-xs font-semibold text-[var(--primary-dark)] uppercase tracking-wider bg-[var(--primary-light)] px-2.5 py-1 rounded-md">
              MVP
            </span>
          </div>

          <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
            Your life and career can travel with you
          </p>
        </button>

        <div className="flex items-center gap-3">
          {user && (
            <button
              type="button"
              onClick={() => signOut()}
              className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title={user.email ? `Log out (${user.email})` : 'Log out'}
            >
              <LogOut size={16} aria-hidden="true" />
              Log out
            </button>
          )}
          <ThemeToggle />
        </div>
      </div>

      {/* Main Content — below lg, the AI copilot lives in a floating
          button + overlay sheet (see below) instead of a permanent block,
          so pillar content gets the full width/height. At lg and up, the
          existing side-by-side layout is unchanged. */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Sidebar (AI copilot) — desktop/tablet only below; the lg:flex
            override is what makes it visible again at that breakpoint,
            with the exact same sizing/border classes as before. */}
        <div
          className="hidden flex-col overflow-hidden border-b lg:flex lg:h-auto lg:w-2/5 lg:border-b-0 lg:border-r"
          style={{ borderColor: 'var(--border-warm)' }}
        >
          <Sidebar
            messages={messages}
            isLoading={isLoading}
            onSendPrompt={handleUserPrompt}
            onQuickAction={handleQuickAction}
            onOpenResumeParser={() => goToPillar('career')}
          />
        </div>

        {/* Dashboard / pillar content */}
        <div className="flex flex-1 flex-col overflow-hidden lg:w-3/5" style={{ backgroundColor: 'var(--bg-app)' }}>
          {/* Guidance nudge — only once the relocation profile is usable
              (same origin/destination-filled condition already used for
              Journey status and Next Best Action below), and only on the
              Dashboard overview itself, not once a pillar is already open. */}
          {activeTab === 'dashboard' && origin.trim() && destination.trim() && (
            <div className="px-6 pt-4 pb-2" style={{ backgroundColor: 'var(--surface)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                You&rsquo;re all set. What would you like to work on first?
              </p>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                Choose an area below and I&rsquo;ll guide you through the next steps.
              </p>
            </div>
          )}

          <TabNavigation activeTab={activeTab as PillarTab} onTabChange={goToPillar} />

          <div ref={careerScrollContainerRef} className="flex-1 overflow-y-auto">
            {/* ============================== */}
            {/* MAIN DASHBOARD (default view) */}
            {/* ============================== */}

            {activeTab === 'dashboard' && (
              <DashboardHome
                origin={origin}
                destinationCountryCode={destinationCountryCode}
                destinationCountryName={destinationCountryName}
                destinationCity={destinationCity}
                relocationDate={relocationDate}
                workSituation={workSituation}
                preferredWorkModel={preferredWorkModel}
                onOriginChange={setOrigin}
                onDestinationCountryChange={(code, name) => {
                  setDestinationCountryCode(code)
                  setDestinationCountryName(name)
                }}
                onDestinationCityChange={setDestinationCity}
                onRelocationDateChange={setRelocationDate}
                onWorkSituationChange={setWorkSituation}
                onPreferredWorkModelChange={setPreferredWorkModel}
                parsedProfile={parsedProfile}
                isLoading={isLoading}
                onNavigate={goToPillar}
                onSendPrompt={handleDashboardPrompt}
              />
            )}

            {/* ============================== */}
            {/* RELOCATION */}
            {/* ============================== */}

            {activeTab === 'relocation' && (
              <div className="p-6 space-y-6">
                <div>
                  <p className="text-sm text-[var(--primary-dark)] font-semibold uppercase tracking-wider">
                    Your Relocation
                  </p>

                  <h2 className="text-3xl font-bold mt-1" style={{ color: 'var(--text-strong)' }}>
                    {origin || 'Your origin'} → {destination || 'Your destination'}
                  </h2>

                  <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
                    Your personalized transition plan starts here.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                        Moving From
                      </label>
                      <input
                        type="text"
                        value={origin}
                        onChange={(e) => setOrigin(e.target.value)}
                        placeholder="e.g. Mumbai"
                        className="w-full text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                        Moving To
                      </label>
                      <select
                        value={destinationCountryCode}
                        onChange={(e) => {
                          const code = e.target.value
                          const country = COUNTRIES.find((c) => c.code === code)
                          setDestinationCountryCode(code)
                          setDestinationCountryName(country?.name ?? '')
                        }}
                        className="w-full text-sm"
                      >
                        <option value="">Select a country…</option>
                        {COUNTRIES.map((country) => (
                          <option key={country.code} value={country.code}>
                            {country.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={destinationCity}
                        onChange={(e) => setDestinationCity(e.target.value)}
                        placeholder="City or region, e.g. Dubai"
                        className="w-full text-sm mt-1.5"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                        Relocation Date
                      </label>
                      <input
                        type="date"
                        value={relocationDate}
                        onChange={(e) => setRelocationDate(e.target.value)}
                        className="w-full text-sm"
                      />
                    </div>
                  </div>
                </div>

                <RelocationReadiness destination={destination} />

                {/* AI Priorities */}
                <div className="border rounded-lg p-6" style={{ borderColor: 'var(--border-warm)' }}>
                  <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-strong)' }}>
                    AI Priorities
                  </h3>

                  <div className="space-y-4">
                    {[
                      {
                        title: 'Explore housing options',
                        detail: 'Find areas that fit your budget and commute.',
                        onClick: () => goToPillar('life'),
                      },
                      {
                        title: 'Review career opportunities',
                        detail: 'Compare local, remote and freelance options.',
                        onClick: () => goToPillar('career'),
                      },
                      {
                        title: 'Check work eligibility',
                        detail: 'Understand whether an EOR pathway may be required.',
                        onClick: () => setShowWorkEligibilityNotice((prev) => !prev),
                      },
                    ].map((priority, index) => (
                      <div key={priority.title}>
                        <button
                          type="button"
                          onClick={priority.onClick}
                          className="flex w-full items-start gap-3 rounded-md -mx-2 px-2 py-1 text-left transition-colors hover:bg-[var(--surface-2)]"
                        >
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary-light)] text-xs font-bold text-[var(--primary-dark)]"
                            aria-hidden="true"
                          >
                            {index + 1}
                          </span>
                          <div>
                            <p className="font-medium" style={{ color: 'var(--text-strong)' }}>{priority.title}</p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{priority.detail}</p>
                          </div>
                        </button>
                        {priority.title === 'Check work eligibility' && showWorkEligibilityNotice && (
                          <p className="ml-9 mt-1 text-xs font-medium" style={{ color: 'var(--accent-gold)' }}>
                            Launching soon — work eligibility checks aren't available yet.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ============================== */}
            {/* CAREER & INCOME */}
            {/* ============================== */}

            {activeTab === 'career' && (
              <JobMatcherTab
                parsedProfile={parsedProfile}
                onProfileParsed={handleProfileParsed}
                onResetProfile={handleResetProfile}
                searchState={careerSearchState}
                onSearchStateChange={updateCareerSearchState}
                // Was previously wired bare (no context), unlike every
                // other entry point into the chat (handleUserPrompt below
                // always attaches buildContext()) — meaning the "Ask AI"
                // button's per-job prompt reached Groq without the
                // structured PROFILE/JOB DATA grounding context the rest
                // of the app already relies on. The prompt text itself
                // still carries real computed facts (see
                // CareerRecommendations.tsx's handleAskAi), but the model
                // now also gets the same evidence-grounding instructions
                // and profile/job context every other chat turn does.
                onSendPrompt={(text) => sendPrompt(text, buildContext())}
                destinationCountryCode={destinationCountryCode}
                destinationCountryName={destinationCountryName}
                destinationCity={destinationCity}
                onJobsResolved={handleJobsResolved}
                scrollContainerRef={careerScrollContainerRef}
              />
            )}

            {/* ============================== */}
            {/* LIFE SETUP */}
            {/* ============================== */}

            {activeTab === 'life' && (
              <div className="p-6">
                <div
                  className="rounded-lg p-6 sm:p-8 border"
                  style={{ backgroundColor: 'var(--accent-terracotta-tint)', borderColor: 'var(--accent-terracotta)' }}
                >
                  <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-strong)' }}>
                    Life Setup
                  </h2>
                  <p className="mb-6" style={{ color: 'var(--text-body)' }}>
                    Everything you need to settle into your new country.
                  </p>

                  <div className="mb-4">
                    <HousingResources destination={destination} origin={origin} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { label: 'Healthcare', detail: 'Hospitals, clinics and insurance', icon: Stethoscope },
                      { label: 'Banking', detail: 'Local banking and financial setup', icon: Landmark },
                      { label: 'Education', detail: 'Schools and family services', icon: GraduationCap },
                    ].map((item) => {
                      const Icon = item.icon
                      return (
                        <div key={item.label} className="bg-[var(--surface)] rounded-md p-4 border" style={{ borderColor: 'var(--border-warm)' }}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 font-medium text-[var(--accent-terracotta-strong)]">
                              <Icon size={16} aria-hidden="true" />
                              {item.label}
                            </div>
                            <span
                              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                              style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}
                            >
                              Launching soon
                            </span>
                          </div>
                          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{item.detail}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ============================== */}
            {/* COMMUNITY */}
            {/* ============================== */}

            {activeTab === 'community' && (
              <div className="p-6">
                <CommunityResources destination={destination} origin={origin} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile AI copilot — floating launcher + overlay sheet, lg:hidden
          so it never appears once the inline desktop sidebar above is
          visible. Same Sidebar instance/props/state as the desktop
          version — this is not a second chat implementation. */}
      {!isMobileChatOpen && (
        <button
          type="button"
          onClick={() => setIsMobileChatOpen(true)}
          aria-label="Open AI Copilot chat"
          className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 lg:hidden"
          style={{ backgroundColor: 'var(--primary-dark)' }}
        >
          <MessageCircle size={24} aria-hidden="true" />
        </button>
      )}

      {isMobileChatOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsMobileChatOpen(false)}
            aria-hidden="true"
          />

          <div
            className="relative flex h-[75vh] flex-col overflow-hidden rounded-t-xl border-t shadow-lg"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-warm)' }}
          >
            <div
              className="flex shrink-0 items-center justify-between border-b px-4 py-3"
              style={{ borderColor: 'var(--border-warm)' }}
            >
              <span className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                AI Copilot
              </span>
              <button
                type="button"
                onClick={() => setIsMobileChatOpen(false)}
                aria-label="Close AI Copilot chat"
                className="rounded-md p-1.5 transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1">
              <Sidebar
                messages={messages}
                isLoading={isLoading}
                onSendPrompt={handleUserPrompt}
                onQuickAction={handleQuickAction}
                onOpenResumeParser={() => {
                  setIsMobileChatOpen(false)
                  goToPillar('career')
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
