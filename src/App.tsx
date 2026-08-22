import { useState } from 'react'
import type { ResumeProfile } from './types'
import Sidebar from './components/SideBar'
import TabNavigation from './components/TabNavigation'
import JobMatcherTab from './components/JobMatcherTab'
import './styles/theme.css'

function App() {
  const [activeTab, setActiveTab] = useState<'career' | 'tax' | 'portfolio'>('career')
  const [parsedProfile, setParsedProfile] = useState<ResumeProfile | null>(null)
  const [messages, setMessages] = useState<any[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Welcome to PivotPartner! 🌍

I help trailing spouses find remote careers that pay globally, not locally.

📋 Here's how I work:

✅ Upload your resume
   ↓ I analyze your skills & experience

✅ Get matched with remote jobs
   ↓ See opportunities paying 2-3x local salary

✅ Explore relocation insights
   ↓ Tax implications, schools, housing in 100+ cities

✅ Build optimized portfolio
   ↓ Land your dream remote role

Ready to restart your career? Upload your resume to get started! 🚀`,
      timestamp: new Date(),
    },
  ])

  const handleSendMessage = (content: string) => {
    // User message is added by Sidebar via chatWithGroq
    // This function just tracks it if needed
  }

  const handleQuickAction = (action: 'jobs' | 'tax' | 'resume') => {
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
            ? `🎯 Perfect! I found remote job opportunities for you:

📊 Your Profile Summary:
• ${parsedProfile.yearsExperience} years of experience
• Seniority: ${parsedProfile.seniority || 'Professional Level'}
• Industries: ${parsedProfile.industries?.join(', ') || 'Various'}
• Top Skills: ${parsedProfile.skills?.slice(0, 3).map(s => s.name).join(', ') || 'expertise'}

💼 Remote Opportunities Available:
• Full-time Remote: ${Math.floor(Math.random() * 10) + 8} positions
• Freelance Projects: ${Math.floor(Math.random() * 5) + 2} active gigs
• Contract Work: ${Math.floor(Math.random() * 4) + 2} opportunities

Check the Career tab to see detailed matches with:
✅ Salary ranges (often 2-3x your local rate!)
✅ Skill gaps you need to address
✅ Learning resources to bridge gaps
✅ Estimated time to job readiness

Click on any job to unlock Tax Safe-Zone for that location! 🌍`
            : `📋 I'd love to show you remote job opportunities! First, please upload your resume in the Career tab so I can:
  
✅ Extract your skills and experience
✅ Analyze your career profile
✅ Match you with the best global opportunities

Let's get started! 🚀`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, aiMsg])
      }, 800)
    } else if (action === 'tax') {
      const userMsg = {
        id: Date.now().toString(),
        role: 'user',
        content: '📊 Check Tax Safe-Zone',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMsg])

      setTimeout(() => {
        const aiMsg = {
          id: (Date.now() + 100).toString(),
          role: 'assistant',
          content: `📊 Tax Safe-Zone is your relocation guide! It unlocks when you select a remote job.

Once unlocked, you'll see:

💰 Tax Implications
   Compare your local tax rate vs remote work tax impact
   See how much you can save

🏫 Schools Information
   Find schools in your destination city
   Check ratings, curricula, fees
   See what expat families recommend

🏠 Housing & Neighborhoods
   Compare neighborhoods by safety, walkability, vibe
   Browse housing listings with prices
   Check commute times and amenities

🎯 Cost of Living Analysis
   Breakdown: rent, utilities, transport, food
   See if your remote salary goes further
   Make informed relocation decisions

Select a remote job from the Career tab to unlock Tax Safe-Zone for that location!`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, aiMsg])
      }, 800)
    } else if (action === 'resume') {
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
            ? `📄 I can help you adapt your resume for remote roles!

Your Current Profile Highlights:
✅ ${parsedProfile.skills?.slice(0, 2).map(s => s.name).join(' and ')} (core strengths)
✅ ${parsedProfile.yearsExperience} years experience (strong foundation)
✅ ${parsedProfile.industries?.slice(0, 2).join(', ')} (relevant industries)

Here's what I'll optimize:

🎯 Keyword Optimization
   Add remote-friendly keywords (async communication, timezone-flexible, global collaboration)
   Highlight distributed team experience

💼 Remote Skills Emphasis
   Showcase: self-motivation, time management, written communication
   Emphasize: remote work experience if any

📊 Achievement Metrics
   Quantify results: "Increased X by Y%", "Led Z people"
   Global companies love numbers!

🌍 Global Appeal
   Mention: multilingual abilities, international experience, visa sponsorship eligibility
   Show you're ready for global opportunity

Check the Portfolio Builder tab when unlocked to see your optimized portfolio! 🚀`
            : `📄 I'd love to help you optimize your resume for remote roles!

First, upload your resume in the Career tab so I can:
✅ Analyze your current experience
✅ Identify remote-friendly skills
✅ Suggest keyword optimizations
✅ Show you how to highlight global appeal

Let's make your resume stand out to remote employers! 🚀`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, aiMsg])
      }, 800)
    }
  }

  const handleProfileParsed = (profile: ResumeProfile) => {
    setParsedProfile(profile)

    // Simulate job breakdown
    const freelanceJobs = Math.floor(Math.random() * 5) + 2  // 2-7
    const remoteJobs = Math.floor(Math.random() * 10) + 8    // 8-18
    const totalJobs = freelanceJobs + remoteJobs

    // Simulate skill gaps
    const allSkills = profile.skills || []
    const matchedSkills = Math.floor(allSkills.length * 0.7) // 70% match
    const gapSkills = allSkills.length - matchedSkills

    const gapSkillsList = allSkills
      .slice(-gapSkills)
      .map(s => s.name)
      .slice(0, 3)
      .join(', ')

    const readyPercentage = Math.round((matchedSkills / allSkills.length) * 100)

    const aiMsg = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `✅ Resume analyzed successfully!

📊 Your Career Profile:
• Years of Experience: ${profile.yearsExperience}
• Seniority Level: ${profile.seniority || 'Professional'}
• Industries: ${profile.industries?.join(', ') || 'Various'}
• Total Skills Identified: ${profile.skills?.length || 0}

🎯 Job Opportunities Found: ${totalJobs} positions!
• 💼 Remote Jobs: ${remoteJobs} (higher pay, location flexible)
• 🤝 Freelance Gigs: ${freelanceJobs} (project-based, flexible)

⚠️ Skill Gap Analysis:
• Skills Matched: ${matchedSkills}/${allSkills.length}
• Skills to Develop: ${gapSkillsList}
• Ready Score: ${readyPercentage}% job-ready

🎯 What would you like to do?

1️⃣ See Job Matches Now
   Browse ${remoteJobs} remote + ${freelanceJobs} freelance opportunities
   Filter by job type, salary, industry
   
2️⃣ Close Skill Gaps First
   Learn ${gapSkills} missing skills
   Estimated time: 4-8 weeks
   Then apply to higher-paying roles

3️⃣ Build Optimized Portfolio
   Create resume tailored for your target roles
   Unlock when you select a job

Which path interests you? Tell me and I'll guide you! 🚀`,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, aiMsg])
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Enhanced Header */}
      <div className="border-b border-[#F5F5F5] bg-white px-6 py-4 shadow-soft">
        <div className="max-w-full">
          <div className="flex items-baseline gap-3 mb-1">
            <h1 className="text-3xl font-bold text-[#26c485] tracking-tight">PivotPartner AI</h1>
            <span className="text-xs font-semibold text-[#26c485]/60 uppercase tracking-wider bg-[#26c485]/10 px-2.5 py-1 rounded-full">MVP</span>
          </div>
          <p className="text-sm text-[#333333]/60 font-medium">Your career can travel with you</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar (40%) */}
        <div className="w-2/5 border-r border-[#F5F5F5] flex flex-col overflow-hidden bg-white">
          <Sidebar
            messages={messages}
            onSendMessage={handleSendMessage}
            onQuickAction={handleQuickAction}
          />
        </div>

        {/* Dashboard (60%) */}
        <div className="w-3/5 flex flex-col overflow-hidden bg-white">
          <TabNavigation 
            activeTab={activeTab} 
            onTabChange={setActiveTab}
            jobMatched={false}
          />

          <div className="flex-1 overflow-y-auto bg-white">
            {activeTab === 'career' && (
              <JobMatcherTab 
                onProfileParsed={handleProfileParsed}
              />
            )}

            {activeTab === 'tax' && (
              <div className="p-6">
                <div className="bg-[#26c485]/5 border border-[#26c485]/20 rounded-lg p-8 text-center">
                  <h2 className="text-2xl font-bold text-[#333333] mb-2">⚖️ Tax Safe-Zone</h2>
                  <p className="text-[#333333]/60 mb-4">
                    Compare tax implications, cost of living, schools, and housing for your destination
                  </p>
                  <p className="text-sm text-[#333333]/50 mt-4">Select a job from the Career tab to unlock this feature</p>
                </div>
              </div>
            )}

            {activeTab === 'portfolio' && (
              <div className="p-6">
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-8 text-center">
                  <h2 className="text-2xl font-bold text-[#333333] mb-2">💼 Portfolio Builder</h2>
                  <p className="text-[#333333]/60 mb-4">
                    Create a professional portfolio optimized for remote hiring
                  </p>
                  {parsedProfile ? (
                    <div className="mt-6 p-4 bg-white rounded-lg border border-purple-200 animate-slide-in">
                      <p className="text-sm text-[#333333] mb-3">
                        Ready to build your portfolio! You'll get:
                      </p>
                      <ul className="text-xs text-[#333333]/60 space-y-1 text-left">
                        <li>✅ Professional headline and summary</li>
                        <li>✅ Keyword-optimized skills section</li>
                        <li>✅ Project portfolio with impact stories</li>
                        <li>✅ Export as PDF or shareable link</li>
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-[#333333]/50 mt-4">Upload your resume first to build your portfolio</p>
                  )}
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
