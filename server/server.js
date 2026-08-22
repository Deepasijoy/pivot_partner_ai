import express from 'express'
import cors from 'cors'
import fetch from 'node-fetch'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'openai/gpt-oss-20b'

// Verify API key on startup
if (!GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY is not set in .env file')
  process.exit(1)
}

console.log('✅ Groq API Key loaded')

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', provider: 'Groq', model: MODEL })
})

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' })
    }

    // Prepare messages for Groq (no system messages)
    const groqMessages = messages.map((msg) => ({
      role: msg.role, // 'user' or 'assistant'
      content: msg.content,
    }))

    // Call Groq API
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: groqMessages,
        temperature: 0.7,
        max_tokens: 1024,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      }),
    })

    const data = await response.json()

    // Check for errors
    if (!response.ok) {
      console.error('❌ Groq API Error:', data.error)
      return res.status(response.status).json({ error: data.error })
    }

    // Extract response
    const aiMessage = data.choices[0]?.message?.content

    if (!aiMessage) {
      return res.status(500).json({ error: 'No response from Groq API' })
    }

    res.json({ response: aiMessage })
  } catch (error) {
    console.error('Server error:', error)
    res.status(500).json({ error: error.message })
  }
})

const PORT = 3000
app.listen(PORT, () => {
  console.log(`
🚀 PivotPartner API (Groq) running on port ${PORT}
📍 Health: http://localhost:${PORT}/api/health
💬 Chat: POST http://localhost:${PORT}/api/chat
⚡ Model: ${MODEL} (FAST!)
  `)
})