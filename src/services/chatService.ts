import { fetchWithRetry, FetchTimeoutError } from '../utils/fetchWithRetry'

// Optional-chained — see providers/adzunaProvider.ts for why (importable
// under plain Node, where there is no import.meta.env at all).
const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3000'
// Generous relative to the job-provider timeout: a real LLM completion can
// legitimately take much longer than a job-search API call. Also has to
// cover a cold start on our free-tier backend host, which its own dashboard
// warns "can delay requests by 50 seconds or more" after ~15 min idle — a
// shorter timeout was aborting the very first message after any idle gap,
// before the backend ever got a chance to wake up and answer.
const CHAT_FETCH_TIMEOUT_MS = Number(import.meta.env?.VITE_CHAT_FETCH_TIMEOUT_MS) || 65_000

export async function chatWithGroq(
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }>,
  context?: string
): Promise<string> {
  try {
    // Format messages for backend
    const messages = [
      ...conversationHistory,
      { role: 'user', content: userMessage },
    ]

    const response = await fetchWithRetry(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: messages,
        ...(context ? { context } : {}),
      }),
      timeoutMs: CHAT_FETCH_TIMEOUT_MS,
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Chat API Error:', error)
      throw new Error(error.error?.message || `Error ${response.status}`)
    }

    const data = await response.json()
    return data.response || 'Sorry, I could not get a response.'
  } catch (error) {
    if (error instanceof FetchTimeoutError) {
      console.error('Chat error:', error.message)
      // Our current hosting spins down after ~15 min idle and its own
      // dashboard warns a cold start "can delay requests by 50 seconds or
      // more" — tell the user that honestly instead of implying an outage.
      throw new Error(
        "PivotPartner's AI is waking up after a few minutes of being idle — that can take up to a minute on our current hosting. Please try sending your message again."
      )
    }
    console.error('Chat error:', error)
    throw error
  }
}