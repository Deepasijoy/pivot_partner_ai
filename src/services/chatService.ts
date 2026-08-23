const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export async function chatWithGroq(
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }>
): Promise<string> {
  try {
    // Format messages for backend
    const messages = [
      ...conversationHistory,
      { role: 'user', content: userMessage },
    ]

    const response = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: messages,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Chat API Error:', error)
      throw new Error(error.error?.message || `Error ${response.status}`)
    }

    const data = await response.json()
    return data.response || 'Sorry, I could not get a response.'
  } catch (error) {
    console.error('Chat error:', error)
    throw error
  }
}