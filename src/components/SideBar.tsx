import React, { useState, useRef, useEffect } from 'react';
import type { CopilotMessage } from '../types';
import {
  Send,
  Briefcase,
  TrendingUp,
  FileText,
  Loader2,
} from 'lucide-react';
import { chatWithGroq } from '../services/chatService';

interface SidebarProps {
  messages: CopilotMessage[];
  onSendMessage: (message: string) => void;
  onQuickAction: (action: 'jobs' | 'tax' | 'resume') => void;
}

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

  // Scroll to latest message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [allMessages]);

  // Send chat message to Groq
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const messageText = inputValue.trim();

    // Add user's message immediately
    const userMsg: CopilotMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setAllMessages((prev) => [...prev, userMsg]);

    // Notify parent
    onSendMessage(messageText);

    // Clear input
    setInputValue('');

    // Show loading state
    setIsLoading(true);

    try {
      // Build conversation history
      const conversationHistory = allMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      console.log('📤 Sending message to Groq:', messageText);

      // Call backend → Groq
      const aiResponse = await chatWithGroq(
        messageText,
        conversationHistory
      );

      console.log('📥 Groq response received');

      // Add AI response
      const aiMsg: CopilotMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date(),
      };

      setAllMessages((prev) => [...prev, aiMsg]);
    } catch (error) {
      console.error('❌ Chat failed:', error);

      // Show friendly error in chat
      const errorMsg: CopilotMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content:
          'Sorry, I could not connect to the AI right now. Please try again.',
        timestamp: new Date(),
      };

      setAllMessages((prev) => [...prev, errorMsg]);
    } finally {
      // IMPORTANT: Always stop loading
      setIsLoading(false);
    }
  };

  // Enter = send
  // Shift + Enter = new line
  const handleKeyPress = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Quick actions
  const quickActions = [
    {
      id: 'jobs',
      icon: Briefcase,
      label: '💼 Show Remote Jobs',
      action: 'jobs' as const,
    },
    {
      id: 'tax',
      icon: TrendingUp,
      label: '📊 Check Tax Safe-Zone',
      action: 'tax' as const,
    },
    {
      id: 'resume',
      icon: FileText,
      label: '📄 Adapt My Resume',
      action: 'resume' as const,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-white border-r border-[#F5F5F5]">

      {/* ============================= */}
      {/* QUICK ACTIONS */}
      {/* ============================= */}

      <div className="p-4 border-b border-[#F5F5F5] bg-gradient-to-b from-white to-[#F5F5F5]">

        <p className="text-xs font-semibold text-[#333333]/50 mb-3 uppercase tracking-wider">
          Quick Actions
        </p>

        <div className="flex flex-col gap-2">

          {quickActions.map((action) => {
            const Icon = action.icon;

            return (
              <button
                key={action.id}
                onClick={() =>
                  onQuickAction(action.action)
                }
                className="group relative w-full rounded-lg border border-[#26c485]/30 bg-white px-3 py-2.5 text-xs font-medium text-[#26c485] transition-all duration-200 hover:border-[#26c485] hover:bg-[#26c485]/5 hover:shadow-soft active:scale-98 flex items-center gap-2"
              >
                <Icon
                  size={14}
                  className="group-hover:scale-110 transition-transform"
                />

                <span>{action.label}</span>
              </button>
            );
          })}

        </div>
      </div>

      {/* ============================= */}
      {/* CHAT MESSAGES */}
      {/* ============================= */}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">

        {allMessages.length === 0 ? (

          <div className="flex items-center justify-center h-full">

            <div className="text-center max-w-xs">

              <div className="w-12 h-12 bg-[#26c485]/10 rounded-full flex items-center justify-center mx-auto mb-3">

                <svg
                  className="w-6 h-6 text-[#26c485]"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" />
                </svg>

              </div>

              <p className="text-sm text-[#333333]/60 font-medium">
                Start a conversation
              </p>

              <p className="text-xs text-[#333333]/40 mt-1">
                Click a quick action or ask me anything about remote careers
              </p>

            </div>

          </div>

        ) : (

          allMessages.map((msg) => (

            <div
              key={msg.id}
              className={`flex ${
                msg.role === 'user'
                  ? 'justify-end'
                  : 'justify-start'
              } animate-slide-in`}
            >

              <div
                className={`max-w-xs rounded-lg px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#26c485] text-white rounded-br-none shadow-soft'
                    : 'bg-[#F5F5F5] text-[#333333] rounded-bl-none border border-[#e0e0e0]'
                }`}
              >

                <p className="break-words whitespace-pre-wrap">
                  {msg.content}
                </p>

                <p
                  className={`mt-2 text-xs ${
                    msg.role === 'user'
                      ? 'text-white/70'
                      : 'text-[#333333]/40'
                  }`}
                >
                  {new Date(
                    msg.timestamp
                  ).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>

              </div>

            </div>

          ))

        )}

        {/* ============================= */}
        {/* LOADING */}
        {/* ============================= */}

        {isLoading && (

          <div className="flex justify-start animate-fade-in">

            <div className="bg-[#F5F5F5] rounded-lg rounded-bl-none px-4 py-3 flex items-center gap-2 border border-[#e0e0e0]">

              <Loader2
                size={16}
                className="animate-spin text-[#26c485]"
              />

              <span className="text-sm text-[#333333]/60">
                Groq is thinking...
              </span>

            </div>

          </div>

        )}

        <div ref={messagesEndRef} />

      </div>

      {/* ============================= */}
      {/* CHAT INPUT */}
      {/* ============================= */}

      <div className="border-t border-[#F5F5F5] p-4 bg-gradient-to-b from-white to-[#F5F5F5]">

        <div className="flex gap-2">

          <input
            type="text"
            value={inputValue}
            onChange={(e) =>
              setInputValue(e.target.value)
            }
            onKeyDown={handleKeyPress}
            placeholder="Ask PivotPartner..."
            disabled={isLoading}
            className="flex-1 rounded-lg border border-[#F5F5F5] bg-white px-4 py-2.5 text-sm outline-none transition-all duration-200 placeholder-[#333333]/40 focus:border-[#26c485] focus:ring-2 focus:ring-[#26c485] focus:ring-opacity-20 disabled:opacity-50 disabled:cursor-not-allowed shadow-soft"
          />

          <button
            onClick={handleSendMessage}
            disabled={
              isLoading || !inputValue.trim()
            }
            className="rounded-lg bg-[#26c485] p-2.5 text-white transition-all duration-200 hover:bg-[#1a8b5a] hover:shadow-soft active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              isLoading
                ? 'Waiting for response...'
                : 'Send message (Enter)'
            }
          >

            {isLoading ? (
              <Loader2
                size={18}
                className="animate-spin"
              />
            ) : (
              <Send size={18} />
            )}

          </button>

        </div>

        <p className="text-xs text-[#333333]/40 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>

      </div>

    </div>
  );
};

export default Sidebar;