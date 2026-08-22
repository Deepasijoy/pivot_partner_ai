import React, { useState } from 'react';
import type { ResumeProfile, CopilotMessage } from '../types';

// TODO: once created, replace the placeholder blocks below with:
// import Sidebar from './Sidebar';
// import TabNavigation from './TabNavigation';
// import JobMatcherTab from './JobMatcherTab';

type DashboardTab = 'career' | 'tax' | 'portfolio';

interface QuickAction {
  emoji: string;
  label: string;
  tab: DashboardTab;
}

const QUICK_ACTIONS: QuickAction[] = [
  { emoji: '💼', label: 'Jobs', tab: 'career' },
  { emoji: '📊', label: 'Tax', tab: 'tax' },
  { emoji: '📄', label: 'Resume', tab: 'portfolio' },
];

const TABS: { id: DashboardTab; label: string }[] = [
  { id: 'career', label: 'Career' },
  { id: 'tax', label: 'Tax' },
  { id: 'portfolio', label: 'Portfolio' },
];

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('career');
  const [parsedProfile] = useState<ResumeProfile | null>(null);
  const [chatMessages, setChatMessages] = useState<CopilotMessage[]>([]);
  const [chatInput, setChatInput] = useState('');

  const handleSendMessage = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;

    const message: CopilotMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    setChatMessages((prev) => [...prev, message]);
    setChatInput('');
  };

  return (
    <div className="min-h-screen w-full bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6 md:grid md:grid-cols-[2fr_3fr] md:items-start">
        {/* Sidebar (40% on desktop): chat interface + quick action pills */}
        <aside className="flex flex-col rounded-xl border border-[#F5F5F5] bg-white shadow-sm md:sticky md:top-6 md:h-[calc(100vh-3rem)]">
          <div className="border-b border-[#F5F5F5] px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-[#333333]">PivotPartner Copilot</h2>
            <p className="text-xs text-[#333333]/60">Ask me anything about your career move</p>
          </div>

          {/* Quick action pills */}
          <div className="flex flex-wrap gap-2 border-b border-[#F5F5F5] px-4 py-3 sm:px-5">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.tab}
                type="button"
                onClick={() => setActiveTab(action.tab)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === action.tab
                    ? 'bg-[#26c485] text-white'
                    : 'bg-[#F5F5F5] text-[#333333] hover:bg-[#26c485]/10'
                }`}
              >
                {action.emoji} {action.label}
              </button>
            ))}
          </div>

          {/* Chat messages area (scrollable) */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
            {chatMessages.length === 0 ? (
              <p className="text-sm text-[#333333]/50">
                No messages yet — ask about jobs, tax scenarios, or your resume.
              </p>
            ) : (
              chatMessages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    message.role === 'user'
                      ? 'ml-auto bg-[#26c485] text-white'
                      : 'bg-[#F5F5F5] text-[#333333]'
                  }`}
                >
                  {message.content}
                </div>
              ))
            )}
          </div>

          {/* Chat input */}
          <form onSubmit={handleSendMessage} className="flex gap-2 border-t border-[#F5F5F5] px-4 py-3 sm:px-5">
            <input
              type="text"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Type a message..."
              className="flex-1 rounded-md border border-[#F5F5F5] px-3 py-2 text-sm text-[#333333] outline-none focus:border-[#26c485]"
            />
            <button
              type="submit"
              className="rounded-md bg-[#26c485] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Send
            </button>
          </form>
        </aside>

        {/* Main area (60% on desktop): tab navigation + tab content */}
        <main className="flex flex-col rounded-xl border border-[#F5F5F5] bg-white shadow-sm">
          {/* Tab navigation */}
          <div className="flex border-b border-[#F5F5F5] px-4 sm:px-5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-b-2 border-[#26c485] text-[#26c485]'
                    : 'text-[#333333]/60 hover:text-[#333333]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content (placeholder — swapped for real tab components later) */}
          <div className="flex-1 px-4 py-6 sm:px-5">
            {activeTab === 'career' && (
              <div className="rounded-lg border border-dashed border-[#F5F5F5] p-6 text-center text-sm text-[#333333]/60">
                Career tab content (JobMatcherTab) goes here.
              </div>
            )}
            {activeTab === 'tax' && (
              <div className="rounded-lg border border-dashed border-[#F5F5F5] p-6 text-center text-sm text-[#333333]/60">
                Tax scenario content goes here.
              </div>
            )}
            {activeTab === 'portfolio' && (
              <div className="rounded-lg border border-dashed border-[#F5F5F5] p-6 text-center text-sm text-[#333333]/60">
                {parsedProfile
                  ? `Portfolio content for a ${parsedProfile.yearsExperience}-year profile goes here.`
                  : 'Portfolio content goes here — upload a resume to get started.'}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
