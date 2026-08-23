import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import type { ResumeProfile, CopilotMessage, AppTab, PillarTab } from './types'
import Sidebar from './components/SideBar'
import TabNavigation from './components/TabNavigation'
import JobMatcherTab from './components/JobMatcherTab'
import ThemeToggle from './components/ThemeToggle'
import DashboardHome from './components/DashboardHome'
import { useGroqChat } from './hooks/useGroqChat'
import {
  FileCheck,
  Home,
  Briefcase,
  Wallet,
  Users,
  Stethoscope,
  Landmark,
  GraduationCap,
  Globe,
  HeartHandshake,
  Target,
} from 'lucide-react'
import './styles/theme.css'

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard')

  const [parsedProfile, setParsedProfile] =
    useState<ResumeProfile | null>(null)
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [relocationDate, setRelocationDate] = useState('')

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

  useEffect(() => {
    const state = location.state as { initialPrompt?: string } | null
    if (state?.initialPrompt && !initialPromptSent.current) {
      initialPromptSent.current = true
      sendPrompt(state.initialPrompt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goToPillar = (tab: PillarTab) => setActiveTab(tab)

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

  // Called when JobMatcherTab successfully analyzes a resume
  const handleProfileParsed = (profile: ResumeProfile) => {
    setParsedProfile(profile)

    const allSkills = profile.skills || []

    const matchedSkills = Math.floor(allSkills.length * 0.7)
    const gapSkills = Math.max(allSkills.length - matchedSkills, 0)

    const gapSkillsList = allSkills
      .slice(-gapSkills)
      .map((s) => s.name)
      .slice(0, 3)
      .join(', ')

    const readyPercentage =
      allSkills.length > 0
        ? Math.round((matchedSkills / allSkills.length) * 100)
        : 0

    const aiMsg: CopilotMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `Resume analyzed successfully!

Your career profile:
• Years of experience: ${profile.yearsExperience}
• Seniority: ${profile.seniority || 'Professional'}
• Industries: ${profile.industries?.join(', ') || 'Various'}
• Skills identified: ${allSkills.length}

Skill gap analysis:
• Skills matched: ${matchedSkills}/${allSkills.length}
• Skills to develop: ${gapSkillsList || 'No major gaps identified'}
• Ready score: ${readyPercentage}%

Next steps: explore Career & Income, compare local vs remote options, check work eligibility, and build your global professional profile.

Your career can travel with you.`,
      timestamp: new Date(),
    }

    pushMessage(aiMsg)
  }

  const relocationCategories = [
    { label: 'Documents', value: 80, icon: FileCheck },
    { label: 'Housing', value: 60, icon: Home },
    { label: 'Career', value: 55, icon: Briefcase },
    { label: 'Finances', value: 70, icon: Wallet },
    { label: 'Community', value: 30, icon: Users },
    { label: 'Healthcare', value: 75, icon: Stethoscope },
  ]

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
            <h1 className="text-3xl font-bold text-[var(--primary)] tracking-tight">
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

        <ThemeToggle />
      </div>

      {/* Main Content — stacks on mobile/tablet, side-by-side from lg up */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Sidebar (AI copilot) */}
        <div
          className="flex h-[45vh] flex-col overflow-hidden border-b lg:h-auto lg:w-2/5 lg:border-b-0 lg:border-r"
          style={{ borderColor: 'var(--border-warm)' }}
        >
          <Sidebar
            messages={messages}
            isLoading={isLoading}
            onSendPrompt={sendPrompt}
            onQuickAction={handleQuickAction}
          />
        </div>

        {/* Dashboard / pillar content */}
        <div className="flex flex-1 flex-col overflow-hidden lg:w-3/5" style={{ backgroundColor: 'var(--bg-app)' }}>
          {activeTab !== 'dashboard' && (
            <TabNavigation activeTab={activeTab} onTabChange={goToPillar} />
          )}

          <div className="flex-1 overflow-y-auto">
            {/* ============================== */}
            {/* MAIN DASHBOARD (default view) */}
            {/* ============================== */}

            {activeTab === 'dashboard' && (
              <DashboardHome
                origin={origin}
                destination={destination}
                parsedProfile={parsedProfile}
                isLoading={isLoading}
                onNavigate={goToPillar}
                onSendPrompt={sendPrompt}
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
                      <input
                        type="text"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        placeholder="e.g. Dubai"
                        className="w-full text-sm"
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

                {/* Readiness */}
                <div className="bg-[#26c485]/5 border border-[#26c485]/20 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        Relocation Readiness
                      </p>
                      <p className="text-4xl font-bold text-[var(--primary)]">72%</p>
                    </div>
                    <Target size={40} className="text-[var(--primary)]" aria-hidden="true" />
                  </div>

                  <div className="w-full bg-[var(--surface-2)] rounded-md h-3">
                    <div className="bg-[var(--primary)] h-3 rounded-md" style={{ width: '72%' }} />
                  </div>
                </div>

                {/* Relocation Categories */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {relocationCategories.map((item) => {
                    const Icon = item.icon
                    return (
                      <div key={item.label} className="border rounded-md p-4" style={{ borderColor: 'var(--border-warm)' }}>
                        <div className="flex justify-between mb-2">
                          <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-strong)' }}>
                            <Icon size={14} className="text-[var(--primary-dark)]" aria-hidden="true" />
                            {item.label}
                          </span>
                          <span className="text-sm font-semibold text-[var(--primary-dark)]">{item.value}%</span>
                        </div>

                        <div className="w-full rounded-md h-2" style={{ backgroundColor: 'var(--surface-2)' }}>
                          <div className="bg-[var(--primary)] h-2 rounded-md" style={{ width: `${item.value}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

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
                      },
                      {
                        title: 'Review career opportunities',
                        detail: 'Compare local, remote and freelance options.',
                      },
                      {
                        title: 'Check work eligibility',
                        detail: 'Understand whether an EOR pathway may be required.',
                      },
                    ].map((priority, index) => (
                      <div key={priority.title} className="flex gap-3">
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
              <JobMatcherTab onProfileParsed={handleProfileParsed} />
            )}

            {/* ============================== */}
            {/* LIFE SETUP */}
            {/* ============================== */}

            {activeTab === 'life' && (
              <div className="p-6">
                <div
                  className="rounded-lg p-8 border"
                  style={{ backgroundColor: 'var(--accent-terracotta-tint)', borderColor: 'var(--accent-terracotta)' }}
                >
                  <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-strong)' }}>
                    Life Setup
                  </h2>
                  <p className="mb-6" style={{ color: 'var(--text-body)' }}>
                    Everything you need to settle into your new country.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { label: 'Housing', detail: 'Neighborhoods, rent and commute', icon: Home },
                      { label: 'Healthcare', detail: 'Hospitals, clinics and insurance', icon: Stethoscope },
                      { label: 'Banking', detail: 'Local banking and financial setup', icon: Landmark },
                      { label: 'Education', detail: 'Schools and family services', icon: GraduationCap },
                    ].map((item) => {
                      const Icon = item.icon
                      return (
                        <div key={item.label} className="bg-[var(--surface)] rounded-md p-4 border" style={{ borderColor: 'var(--border-warm)' }}>
                          <div className="flex items-center gap-2 font-medium text-[var(--accent-terracotta-strong)]">
                            <Icon size={16} aria-hidden="true" />
                            {item.label}
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
                <div
                  className="rounded-lg p-8 border"
                  style={{ backgroundColor: 'var(--accent-indigo-tint)', borderColor: 'var(--accent-indigo)' }}
                >
                  <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-strong)' }}>
                    Find Your Community
                  </h2>
                  <p className="mb-6" style={{ color: 'var(--text-body)' }}>
                    Rebuild your professional and social network in your new country.
                  </p>

                  <div className="space-y-3">
                    {[
                      { label: 'Professional Communities', detail: 'Connect with people in your industry.', icon: Briefcase },
                      { label: 'Expat Communities', detail: 'Meet people who have made a similar move.', icon: Globe },
                      { label: 'Women & Family Communities', detail: 'Find relevant local groups and activities.', icon: HeartHandshake },
                    ].map((item) => {
                      const Icon = item.icon
                      return (
                        <div key={item.label} className="bg-[var(--surface)] rounded-md p-4 border" style={{ borderColor: 'var(--border-warm)' }}>
                          <div className="flex items-center gap-2 font-medium text-[var(--accent-indigo-strong)]">
                            <Icon size={16} aria-hidden="true" />
                            {item.label}
                          </div>
                          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{item.detail}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
