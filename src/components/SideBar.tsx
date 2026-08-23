import React, { useState, useRef, useEffect } from 'react';
import type { CopilotMessage } from '../types';
import {
  Send,
  Briefcase,
  TrendingUp,
  FileText,
  Loader2,
  Search,
  ArrowLeftRight,
  Compass,
  ListChecks,
} from 'lucide-react';
import { chatWithGroq } from '../services/chatService';

interface SidebarProps {
  messages: CopilotMessage[];
  onSendMessage: (message: string) => void;
  onQuickAction: (action: 'jobs' | 'tax' | 'resume') => void;
}

const QUICK_START_PROMPTS = [
  { icon: Search, label: 'Find roles for my background' },
  { icon: ArrowLeftRight, label: 'Compare local vs remote vs freelance' },
  { icon: Compass, label: 'Analyze my career options' },
  { icon: ListChecks, label: 'Find my skill gaps' },
];

const Sidebar: React.FC<SidebarProps> = ({
  messages,
  onSendMessage,
  onQuickAction,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [allMessages, setAllMessages] =
    useState<CopilotMessage[]>(messages);
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [allMessages]);

  // Send chat message to Groq
  const sendPrompt = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    const userMsg: CopilotMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setAllMessages((prev) => [...prev, userMsg]);
    onSendMessage(messageText);
    setInputValue('');
    setIsLoading(true);

    try {
      const conversationHistory = allMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const aiResponse = await chatWithGroq(messageText, conversationHistory);

      const aiMsg: CopilotMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date(),
      };

      setAllMessages((prev) => [...prev, aiMsg]);
    } catch (error) {
      console.error('❌ Chat failed:', error);

      const errorMsg: CopilotMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content:
          'Sorry, I could not connect to the AI right now. Please try again.',
        timestamp: new Date(),
      };

      setAllMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = () => sendPrompt(inputValue.trim());

  const handleKeyPress = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const quickActions = [
    { id: 'jobs', icon: Briefcase, label: 'Show Remote Jobs', action: 'jobs' as const },
    { id: 'tax', icon: TrendingUp, label: 'Check Tax Safe-Zone', action: 'tax' as const },
    { id: 'resume', icon: FileText, label: 'Adapt My Resume', action: 'resume' as const },
  ];

  return (
    <div
      className="flex flex-col h-full border-r"
      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-warm)' }}
    >
      {/* ============================= */}
      {/* QUICK ACTIONS */}
      {/* ============================= */}

      <div className="p-4 border-b" style={{ borderColor: 'var(--border-warm)' }}>
        <p
          className="text-xs font-semibold mb-3 uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          Quick Actions
        </p>

        <div className="flex flex-col gap-2">
          {quickActions.map((action) => {
            const Icon = action.icon;

            return (
              <button
                key={action.id}
                onClick={() => onQuickAction(action.action)}
                className="group relative w-full rounded-md border border-[#26c485]/30 bg-[var(--surface)] px-3 py-2.5 text-xs font-medium text-[var(--primary-dark)] transition-all duration-200 hover:border-[#26c485] hover:bg-[#26c485]/5 hover:shadow-soft active:scale-98 flex items-center gap-2"
              >
                <Icon size={14} aria-hidden="true" className="group-hover:scale-110 transition-transform" />
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ============================= */}
      {/* CHAT MESSAGES */}
      {/* ============================= */}

      <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ backgroundColor: 'var(--surface)' }}>
        {allMessages.length === 0 ? (
          <div className="flex h-full flex-col justify-center gap-6 px-1 py-6">
            <div>
              <h2
                className="text-xl font-bold leading-snug"
                style={{ color: 'var(--text-strong)' }}
              >
                Your career doesn't have to relocate backwards.
              </h2>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>
                Tell me where you're moving and what you've done so far. I'll help you find the
                best path forward.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {QUICK_START_PROMPTS.map((prompt) => {
                const Icon = prompt.icon;
                return (
                  <button
                    key={prompt.label}
                    type="button"
                    onClick={() => sendPrompt(prompt.label)}
                    disabled={isLoading}
                    className="flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left text-sm font-medium transition-all hover:shadow-soft disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ borderColor: 'var(--border-warm)', color: 'var(--text-strong)' }}
                  >
                    <Icon size={16} aria-hidden="true" className="shrink-0 text-[var(--primary-dark)]" />
                    <span>{prompt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          allMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              } animate-slide-in`}
            >
              <div
                className={`max-w-xs rounded-md px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#26c485] text-white rounded-br-none shadow-soft'
                    : 'rounded-bl-none border'
                }`}
                style={
                  msg.role === 'assistant'
                    ? { backgroundColor: 'var(--surface-2)', color: 'var(--text-strong)', borderColor: 'var(--border-warm)' }
                    : undefined
                }
              >
                <p className="break-words whitespace-pre-wrap">{msg.content}</p>
                <p
                  className={`mt-2 text-xs ${msg.role === 'user' ? 'text-white/70' : ''}`}
                  style={msg.role === 'assistant' ? { color: 'var(--text-muted)' } : undefined}
                >
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex justify-start animate-fade-in">
            <div
              className="flex items-center gap-2 rounded-md rounded-bl-none border px-4 py-3"
              style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border-warm)' }}
            >
              <Loader2 size={16} className="animate-spin text-[var(--primary-dark)]" aria-hidden="true" />
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Thinking...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ============================= */}
      {/* CHAT INPUT */}
      {/* ============================= */}

      <div className="border-t p-4" style={{ borderColor: 'var(--border-warm)' }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Ask PivotPartner..."
            disabled={isLoading}
            className="flex-1 rounded-md border px-4 py-2.5 text-sm outline-none transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-soft"
            style={{
              borderColor: 'var(--border-warm)',
              backgroundColor: 'var(--surface)',
              color: 'var(--text-strong)',
            }}
          />

          <button
            onClick={handleSendMessage}
            disabled={isLoading || !inputValue.trim()}
            className="rounded-md bg-[#26c485] p-2.5 text-white transition-all duration-200 hover:bg-[#1a8b5a] hover:shadow-soft active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            title={isLoading ? 'Waiting for response...' : 'Send message (Enter)'}
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            ) : (
              <Send size={18} aria-hidden="true" />
            )}
          </button>
        </div>

        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
};

export default Sidebar;
