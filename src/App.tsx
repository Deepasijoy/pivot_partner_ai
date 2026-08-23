import { useState } from 'react'
import type { ResumeProfile } from './types'
import Sidebar from './components/SideBar'
import TabNavigation from './components/TabNavigation'
import JobMatcherTab from './components/JobMatcherTab'
import './styles/theme.css'

type ActiveTab = 'relocation' | 'career' | 'life' | 'community'

function App() {
  const [activeTab, setActiveTab] =
    useState<ActiveTab>('relocation')

  const [parsedProfile, setParsedProfile] =
    useState<ResumeProfile | null>(null)
  const [origin, setOrigin] = useState('Mumbai')
  const [destination, setDestination] = useState('Accra')
  const [relocationDate, setRelocationDate] = useState('')    

  const [messages, setMessages] = useState<any[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Welcome to PivotPartner! 🌍

I'm your AI relocation and career copilot for moving internationally with your partner.

I can help you:

🌍 Plan your relocation
💼 Rebuild your career and income
💰 Compare local vs remote opportunities
📋 Understand work eligibility and EOR options
🏠 Plan your new life
👥 Find professional and local communities

Tell me where you're moving and what you do, and I'll help you build your transition plan. 🚀`,
      timestamp: new Date(),
    },
  ])

  // Chat is handled by Sidebar → chatService → backend → Groq
  const handleSendMessage = (_content: string) => {
    // Sidebar handles the actual chat.
  }

  // Quick actions from Sidebar
  const handleQuickAction = (
    action: 'jobs' | 'tax' | 'resume'
  ) => {
    if (action === 'jobs') {
      setActiveTab('career')

      const userMsg = {
        id: Date.now().toString(),
        role: 'user',
        content: '💼 Show Remote Jobs',
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, userMsg])

      setTimeout(() => {
        const aiMsg = {
          id: (Date.now() + 100).toString(),
          role: 'assistant',
          content: parsedProfile
            ? `🎯 Perfect! Let's look at opportunities that fit your profile.

📊 Your Profile:
• ${parsedProfile.yearsExperience} years of experience
• Seniority: ${parsedProfile.seniority || 'Professional Level'}
• Industries: ${parsedProfile.industries?.join(', ') || 'Various'}
• Top Skills: ${
                parsedProfile.skills
                  ?.slice(0, 3)
                  .map((s) => s.name)
                  .join(', ') || 'Your professional skills'
              }

💼 We'll compare:
• Local opportunities
• Remote opportunities
• Freelance opportunities
• Salary potential
• Work eligibility

Use the Career & Income tab to explore your options.`
            : `📋 Let's find the right opportunities for you.

First, upload your resume in the Career & Income tab so I can:

✅ Extract your skills
✅ Analyze your experience
✅ Identify suitable career paths
✅ Compare local vs remote opportunities

Let's get started! 🚀`,
          timestamp: new Date(),
        }

        setMessages((prev) => [...prev, aiMsg])
      }, 800)
    }

    if (action === 'tax') {
      setActiveTab('relocation')

      const userMsg = {
        id: Date.now().toString(),
        role: 'user',
        content: '📊 Check Relocation & Tax',
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, userMsg])

      setTimeout(() => {
        const aiMsg = {
          id: (Date.now() + 100).toString(),
          role: 'assistant',
          content: `📊 Let's look at the financial side of your relocation.

I'll help you think through:

💰 Local vs remote income
🏦 Banking considerations
📊 Cost of living
🏠 Housing costs
🧾 Tax considerations
🌍 Cross-border work considerations
💼 EOR possibilities

For specific tax or legal decisions, we'll flag where professional advice may be required.

Tell me your destination and expected income to start the analysis.`,
          timestamp: new Date(),
        }

        setMessages((prev) => [...prev, aiMsg])
      }, 800)
    }

    if (action === 'resume') {
      setActiveTab('career')

      const userMsg = {
        id: Date.now().toString(),
        role: 'user',
        content: '📄 Adapt My Resume',
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, userMsg])

      setTimeout(() => {
        const aiMsg = {
          id: (Date.now() + 100).toString(),
          role: 'assistant',
          content: parsedProfile
            ? `📄 I can help reposition your profile for the global market.

Your current strengths include:

✅ ${
                parsedProfile.skills
                  ?.slice(0, 3)
                  .map((s) => s.name)
                  .join(', ') || 'Your professional skills'
              }

✅ ${parsedProfile.yearsExperience} years of experience

✅ ${
                parsedProfile.industries?.join(', ') ||
                'Your professional background'
              }

I'll help emphasize:

🎯 Transferable skills
🌍 International experience
💻 Remote-friendly capabilities
📊 Measurable achievements
💼 Target-role keywords

Open Career & Income to continue.`
            : `📄 Let's optimize your professional profile for the global market.

Upload your resume in the Career & Income tab and I'll help identify:

✅ Transferable skills
✅ Remote-friendly experience
✅ Career pivot opportunities
✅ Skills gaps
✅ Target roles

Let's make your experience travel with you! 🌍`,
          timestamp: new Date(),
        }

        setMessages((prev) => [...prev, aiMsg])
      }, 800)
    }
  }

  // Called when JobMatcherTab successfully analyzes a resume
  const handleProfileParsed = (profile: ResumeProfile) => {
    setParsedProfile(profile)

    const allSkills = profile.skills || []

    const matchedSkills = Math.floor(
      allSkills.length * 0.7
    )

    const gapSkills = Math.max(
      allSkills.length - matchedSkills,
      0
    )

    const gapSkillsList = allSkills
      .slice(-gapSkills)
      .map((s) => s.name)
      .slice(0, 3)
      .join(', ')

    const readyPercentage =
      allSkills.length > 0
        ? Math.round(
            (matchedSkills / allSkills.length) * 100
          )
        : 0

    const aiMsg = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `✅ Resume analyzed successfully!

📊 Your Career Profile:

• Years of Experience: ${profile.yearsExperience}
• Seniority: ${profile.seniority || 'Professional'}
• Industries: ${
        profile.industries?.join(', ') || 'Various'
      }
• Skills Identified: ${allSkills.length}

🎯 Global Career Strategy

I'll now help you compare:

🌍 Local opportunities
💻 Remote opportunities
🤝 Freelance opportunities
💰 Salary potential
📋 Work eligibility

⚠️ Skill Gap Analysis:

• Skills Matched: ${matchedSkills}/${allSkills.length}
• Skills to Develop: ${
        gapSkillsList || 'No major gaps identified'
      }
• Ready Score: ${readyPercentage}%

🎯 Next steps:

1️⃣ Explore Career & Income
2️⃣ Compare local vs remote options
3️⃣ Check work eligibility
4️⃣ Build your global professional profile

Your career can travel with you. 🚀`,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, aiMsg])
  }

  return (
    <div className="h-screen flex flex-col bg-white">

      {/* Header */}
      <div className="border-b border-[#F5F5F5] bg-white px-6 py-4 shadow-soft">
        <div className="max-w-full">

          <div className="flex items-baseline gap-3 mb-1">

            <h1 className="text-3xl font-bold text-[#26c485] tracking-tight">
              PivotPartner AI
            </h1>

            <span className="text-xs font-semibold text-[#26c485]/60 uppercase tracking-wider bg-[#26c485]/10 px-2.5 py-1 rounded-full">
              MVP
            </span>

          </div>

          <p className="text-sm text-[#333333]/60 font-medium">
            Your life and career can travel with you
          </p>

        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <div className="w-2/5 border-r border-[#F5F5F5] flex flex-col overflow-hidden bg-white">

          <Sidebar
            messages={messages}
            onSendMessage={handleSendMessage}
            onQuickAction={handleQuickAction}
          />

        </div>

        {/* Dashboard */}
        <div className="w-3/5 flex flex-col overflow-hidden bg-white">

          <TabNavigation
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />

          <div className="flex-1 overflow-y-auto bg-white">

            {/* ============================== */}
            {/* RELOCATION */}
            {/* ============================== */}

            {activeTab === 'relocation' && (

              <div className="p-6 space-y-6">

                <div>

                  <p className="text-sm text-[#26c485] font-semibold uppercase tracking-wider">
                    Your Relocation
                  </p>

                  
                  <h2 className="text-3xl font-bold text-[#333333] mt-1">
                    {origin || 'Your origin'} → {destination || 'Your destination'}
                  </h2>

                  <p className="text-sm text-[#333333]/60 mt-2">
                    Your personalized transition plan starts here.
                  </p>
                <div className="grid grid-cols-3 gap-3 mt-5">

                <div>
                <label className="block text-xs font-semibold text-[#333333]/60 mb-1">
                   Moving From
                </label>

                <input
                  type="text"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="e.g. Mumbai"
                  className="w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-sm outline-none focus:border-[#26c485] focus:ring-1 focus:ring-[#26c485]"
                  />
                </div>

                <div>
                <label className="block text-xs font-semibold text-[#333333]/60 mb-1">
                  Moving To
                </label>

                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="e.g. Dubai"
                  className="w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-sm outline-none focus:border-[#26c485] focus:ring-1 focus:ring-[#26c485]"
                  />
                </div>

                <div>
                <label className="block text-xs font-semibold text-[#333333]/60 mb-1">
                  Relocation Date
                </label>

                <input
                type="date"
                value={relocationDate}
               onChange={(e) => setRelocationDate(e.target.value)}
              className="w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-sm outline-none focus:border-[#26c485] focus:ring-1 focus:ring-[#26c485]"
                />
              </div>

              </div>

                </div>

                {/* Readiness */}

                <div className="bg-[#26c485]/5 border border-[#26c485]/20 rounded-xl p-6">

                  <div className="flex items-center justify-between mb-4">

                    <div>

                      <p className="text-sm text-[#333333]/60">
                        Relocation Readiness
                      </p>

                      <p className="text-4xl font-bold text-[#26c485]">
                        72%
                      </p>

                    </div>

                    <div className="text-5xl">
                      🌍
                    </div>

                  </div>

                  <div className="w-full bg-white rounded-full h-3">

                    <div
                      className="bg-[#26c485] h-3 rounded-full"
                      style={{ width: '72%' }}
                    />

                  </div>

                </div>

                {/* Relocation Categories */}

                <div className="grid grid-cols-2 gap-4">

                  {[
                    {
                      label: '📄 Documents',
                      value: 80,
                    },
                    {
                      label: '🏠 Housing',
                      value: 60,
                    },
                    {
                      label: '💼 Career',
                      value: 55,
                    },
                    {
                      label: '💰 Finances',
                      value: 70,
                    },
                    {
                      label: '👥 Community',
                      value: 30,
                    },
                    {
                      label: '🏥 Healthcare',
                      value: 75,
                    },
                  ].map((item) => (

                    <div
                      key={item.label}
                      className="border border-[#F0F0F0] rounded-lg p-4"
                    >

                      <div className="flex justify-between mb-2">

                        <span className="text-sm font-medium text-[#333333]">
                          {item.label}
                        </span>

                        <span className="text-sm font-semibold text-[#26c485]">
                          {item.value}%
                        </span>

                      </div>

                      <div className="w-full bg-[#F5F5F5] rounded-full h-2">

                        <div
                          className="bg-[#26c485] h-2 rounded-full"
                          style={{
                            width: `${item.value}%`,
                          }}
                        />

                      </div>

                    </div>

                  ))}

                </div>

                {/* AI Priorities */}

                <div className="border border-[#F0F0F0] rounded-xl p-6">

                  <h3 className="text-lg font-bold text-[#333333] mb-4">
                    🎯 AI Priorities
                  </h3>

                  <div className="space-y-4">

                    <div className="flex gap-3">
                      <span>1️⃣</span>

                      <div>
                        <p className="font-medium text-[#333333]">
                          Explore housing options
                        </p>

                        <p className="text-xs text-[#333333]/50">
                          Find areas that fit your budget and commute.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <span>2️⃣</span>

                      <div>
                        <p className="font-medium text-[#333333]">
                          Review career opportunities
                        </p>

                        <p className="text-xs text-[#333333]/50">
                          Compare local, remote and freelance options.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <span>3️⃣</span>

                      <div>
                        <p className="font-medium text-[#333333]">
                          Check work eligibility
                        </p>

                        <p className="text-xs text-[#333333]/50">
                          Understand whether an EOR pathway may be required.
                        </p>
                      </div>
                    </div>

                  </div>

                </div>

              </div>

            )}

            {/* ============================== */}
            {/* CAREER & INCOME */}
            {/* ============================== */}

            {activeTab === 'career' && (

              <JobMatcherTab
                onProfileParsed={handleProfileParsed}
              />

            )}

            {/* ============================== */}
            {/* LIFE SETUP */}
            {/* ============================== */}

            {activeTab === 'life' && (

              <div className="p-6">

                <div className="bg-[#26c485]/5 border border-[#26c485]/20 rounded-xl p-8">

                  <h2 className="text-2xl font-bold text-[#333333] mb-2">
                    🏠 Life Setup
                  </h2>

                  <p className="text-[#333333]/60 mb-6">
                    Everything you need to settle into your new country.
                  </p>

                  <div className="grid grid-cols-2 gap-4">

                    <div className="bg-white rounded-lg p-4 border">
                      <div className="font-medium">
                        🏠 Housing
                      </div>

                      <p className="text-xs text-gray-500 mt-1">
                        Neighborhoods, rent and commute
                      </p>
                    </div>

                    <div className="bg-white rounded-lg p-4 border">
                      <div className="font-medium">
                        🏥 Healthcare
                      </div>

                      <p className="text-xs text-gray-500 mt-1">
                        Hospitals, clinics and insurance
                      </p>
                    </div>

                    <div className="bg-white rounded-lg p-4 border">
                      <div className="font-medium">
                        🏦 Banking
                      </div>

                      <p className="text-xs text-gray-500 mt-1">
                        Local banking and financial setup
                      </p>
                    </div>

                    <div className="bg-white rounded-lg p-4 border">
                      <div className="font-medium">
                        🎓 Education
                      </div>

                      <p className="text-xs text-gray-500 mt-1">
                        Schools and family services
                      </p>
                    </div>

                  </div>

                </div>

              </div>

            )}

            {/* ============================== */}
            {/* COMMUNITY */}
            {/* ============================== */}

            {activeTab === 'community' && (

              <div className="p-6">

                <div className="bg-[#26c485]/5 border border-[#26c485]/20 rounded-xl p-8">

                  <h2 className="text-2xl font-bold text-[#333333] mb-2">
                    👥 Find Your Community
                  </h2>

                  <p className="text-[#333333]/60 mb-6">
                    Rebuild your professional and social network in your new country.
                  </p>

                  <div className="space-y-3">

                    <div className="bg-white rounded-lg p-4 border">
                      <div className="font-medium">
                        💼 Professional Communities
                      </div>

                      <p className="text-xs text-gray-500 mt-1">
                        Connect with people in your industry.
                      </p>
                    </div>

                    <div className="bg-white rounded-lg p-4 border">
                      <div className="font-medium">
                        🌍 Expat Communities
                      </div>

                      <p className="text-xs text-gray-500 mt-1">
                        Meet people who have made a similar move.
                      </p>
                    </div>

                    <div className="bg-white rounded-lg p-4 border">
                      <div className="font-medium">
                        ❤️ Women & Family Communities
                      </div>

                      <p className="text-xs text-gray-500 mt-1">
                        Find relevant local groups and activities.
                      </p>
                    </div>

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