import { useCallback, useState } from 'react';
import type { CopilotMessage } from '../types';
import { chatWithGroq } from '../services/chatService';

/**
 * Single source of truth for the PivotPartner conversation. Both the
 * sidebar chat panel and the dashboard's contextual AI input read/write
 * through this hook so a prompt sent from either place lands in the same
 * conversation, sent to the same existing Groq-backed /api/chat endpoint
 * via chatService.ts (unchanged).
 */
export function useGroqChat(initialMessages: CopilotMessage[] = []) {
  const [messages, setMessages] = useState<CopilotMessage[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);

  const pushMessage = useCallback((message: CopilotMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const sendPrompt = useCallback(
    async (messageText: string) => {
      const trimmed = messageText.trim();
      if (!trimmed || isLoading) return;

      const userMsg: CopilotMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const conversationHistory = messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        const aiResponse = await chatWithGroq(trimmed, conversationHistory);

        const aiMsg: CopilotMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: aiResponse,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, aiMsg]);
      } catch (error) {
        console.error('Chat failed:', error);

        const errorMsg: CopilotMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Sorry, I could not connect to the AI right now. Please try again.',
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading]
  );

  return { messages, isLoading, sendPrompt, pushMessage };
}
