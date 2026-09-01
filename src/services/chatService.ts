import { fetchWithRetry, FetchTimeoutError } from '../utils/fetchWithRetry'

// Optional-chained — see providers/adzunaProvider.ts for why (importable
// under plain Node, where there is no import.meta.env at all).
const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3000'
// Generous relative to the job-provider timeout: a real LLM completion can
// legitimately take much longer than a job-search API call.
const CHAT_FETCH_TIMEOUT_MS = Number(import.meta.env?.VITE_CHAT_FETCH_TIMEOUT_MS) || 20_000

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
      throw new Error('The AI copilot took too long to respond. Please try again.')
    }
    console.error('Chat error:', error)
    throw error
  }
}