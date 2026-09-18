// Isolated LLM fallback for skill extraction — the ONLY place Groq-specific
// request formatting lives, per the sprint's explicit ask. Everything else
// in the skill-extraction path (server/routes/skills.js,
// escoTaxonomyService.js) only ever calls extractSkillsWithLLM() and reads
// back a plain { matchedIds, rejectedIds } result; it never knows or cares
// that the fallback happens to be Groq.
//
// Hard constraint (non-negotiable, enforced twice): the model may only
// return skill ids from the `candidates` list it's given — never an
// invented id, never a bare label, never anything outside the ESCO
// taxonomy. The prompt asks for this; validateResponse() below re-checks it
// unconditionally against the real candidate list, because a smaller model
// asked to "only pick from this list" cannot be trusted to actually comply
// 100% of the time — see README.md's Known LLM reliability notes for what
// was actually observed in testing against openai/gpt-oss-20b.

import { fetchWithRetry } from '../fetchWithRetry.js'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'openai/gpt-oss-20b'
const DEFAULT_TIMEOUT_MS = 15_000

const SYSTEM_PROMPT = `You are a strict, literal skill-matching classifier for a job-matching system.

You will be given a numbered list of ALLOWED skills, each as "id: label", and a block of resume or job-listing text.

Your only task: return the ids of allowed skills that are genuinely demonstrated or required by the text.

Rules, all mandatory:
1. You may ONLY return ids that appear in the allowed list below. Never invent an id. Never return an id from outside this list, even if you know of a better-fitting skill elsewhere.
2. Never return a label, name, or description in place of an id — ids only.
3. Copy each id EXACTLY as printed in the allowed list, character for character, including any prefix before a colon (e.g. "skill:1996" must be returned as "skill:1996", never "1996" or "1996 (Python)"). Do not shorten, reformat, or paraphrase an id.
4. If none of the allowed skills genuinely apply, return an empty array.
5. Do not guess or infer loosely — only include a skill if the text actually demonstrates or requires it, not merely a vaguely related topic.
6. Output ONLY a raw JSON array of id strings. No explanation, no markdown code fences, no surrounding text.`

function buildUserPrompt(text, candidates) {
  const list = candidates.map((c) => `${c.id}: ${c.label}`).join('\n')
  return `Allowed skills:\n${list}\n\nText:\n${text}`
}

function stripCodeFence(raw) {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1] : trimmed
}

/**
 * Parses and validates the model's raw response against the real candidate
 * list. Returns { matchedIds, rejectedIds, parseError } — rejectedIds is
 * populated whenever the model returned something not in `candidates`
 * (an invented id, a label, or a duplicate/malformed entry), so callers can
 * log exactly how the model deviated rather than silently dropping it.
 */
export function validateResponse(rawContent, candidates) {
  const validIds = new Set(candidates.map((c) => c.id))
  let parsed
  try {
    parsed = JSON.parse(stripCodeFence(rawContent))
  } catch {
    return { matchedIds: [], rejectedIds: [], parseError: `Response was not valid JSON: ${rawContent.slice(0, 200)}` }
  }

  if (!Array.isArray(parsed)) {
    return { matchedIds: [], rejectedIds: [], parseError: `Response was valid JSON but not an array: ${rawContent.slice(0, 200)}` }
  }

  const matchedIds = []
  const rejectedIds = []
  for (const entry of parsed) {
    if (typeof entry !== 'string') {
      rejectedIds.push(String(entry))
      continue
    }
    if (validIds.has(entry)) {
      if (!matchedIds.includes(entry)) matchedIds.push(entry)
    } else {
      rejectedIds.push(entry)
    }
  }

  return { matchedIds, rejectedIds, parseError: null }
}

/**
 * `deps` is injectable so tests (and callers that already have their own
 * fetch wrapper) never have to hit the real Groq API — mirrors server.js's
 * own `deps`-for-Groq-calls pattern.
 */
export async function extractSkillsWithLLM(text, candidates, deps = {}) {
  const {
    apiKey = process.env.GROQ_API_KEY,
    apiUrl = GROQ_API_URL,
    model = process.env.GROQ_SKILL_EXTRACTION_MODEL || DEFAULT_MODEL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = deps

  if (candidates.length === 0) {
    return { matchedIds: [], rejectedIds: [], error: null }
  }
  if (!apiKey) {
    return { matchedIds: [], rejectedIds: [], error: 'GROQ_API_KEY is not configured.' }
  }

  try {
    const response = await fetchWithRetry(fetchImpl, apiUrl, {
      method: 'POST',
      timeoutMs,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(text, candidates) },
        ],
        temperature: 0,
        max_tokens: 1024,
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      return { matchedIds: [], rejectedIds: [], error: `Groq API returned ${response.status}: ${JSON.stringify(data.error ?? data)}` }
    }

    const content = data.choices?.[0]?.message?.content
    if (!content) {
      return { matchedIds: [], rejectedIds: [], error: 'Groq returned no message content.' }
    }

    const { matchedIds, rejectedIds, parseError } = validateResponse(content, candidates)
    return { matchedIds, rejectedIds, error: parseError }
  } catch (err) {
    return { matchedIds: [], rejectedIds: [], error: err instanceof Error ? err.message : 'Unknown Groq extraction failure.' }
  }
}
