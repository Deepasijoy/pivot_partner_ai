// Server-side skill extraction orchestrator: direct ESCO label/alias
// matching first, then the isolated Groq fallback (skillExtractionLLM.js)
// for whatever's left, then logs genuinely unmatched phrases so taxonomy
// gaps are visible instead of silently dropped. This is what
// server/routes/skills.js calls; it never talks to Groq itself.

import { appendFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { findSkillIdsInText, buildLlmCandidateShortlist, getSkill } from './escoTaxonomyService.js'
import { extractSkillsWithLLM } from './skillExtractionLLM.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOG_PATH = path.join(__dirname, '..', 'data', 'unmatched-skill-terms.log')

const MAX_LLM_CANDIDATES = 150
// Below this length a "phrase" is almost certainly punctuation/formatting
// noise, not a skill mention; above it, it's prose, not a skill-list item.
const MIN_PHRASE_LEN = 3
const MAX_PHRASE_LEN = 60
const MAX_PHRASE_WORDS = 6

// Splits text into short, skill-list-shaped candidate phrases — the same
// "structural heuristic, not real NLP" approach resumeParserService.ts
// already uses for title-line detection. Used only to (a) find what to send
// the LLM fallback and (b) find what to log as a taxonomy gap when even the
// LLM fallback can't place it — never used to invent a skill gap directly.
function extractCandidatePhrases(text) {
  const segments = text.split(/[,;•\n\r\-–|]+/)
  const phrases = []
  for (const raw of segments) {
    const trimmed = raw.trim()
    if (trimmed.length < MIN_PHRASE_LEN || trimmed.length > MAX_PHRASE_LEN) continue
    const words = trimmed.split(/\s+/)
    if (words.length > MAX_PHRASE_WORDS) continue
    phrases.push(trimmed)
  }
  return phrases
}

function logUnmatchedTerms(terms) {
  if (terms.length === 0) return
  try {
    mkdirSync(path.dirname(LOG_PATH), { recursive: true })
    const timestamp = new Date().toISOString()
    const lines = terms.map((term) => `${timestamp}\t${term}`).join('\n') + '\n'
    appendFileSync(LOG_PATH, lines, 'utf8')
  } catch (err) {
    console.warn('[skillExtractionService] failed to write unmatched-skill-terms.log:', err)
  }
}

/**
 * Extracts ESCO skills from free text (resume or job listing). Returns
 * { skills: [{id, label, categories}], unmatchedTerms: string[] } — never
 * throws; a Groq failure just means fewer skills matched, not a broken
 * request (mirrors every other provider adapter's isolation guarantee in
 * this codebase).
 */
export async function extractSkillsFromText(text) {
  if (!text || !text.trim()) return { skills: [], unmatchedTerms: [] }

  const directMatchIds = new Set(findSkillIdsInText(text))

  const candidatePhrases = extractCandidatePhrases(text)
  const unmatchedPhrases = candidatePhrases.filter((phrase) => findSkillIdsInText(phrase).length === 0)

  let llmMatchedIds = []
  if (unmatchedPhrases.length > 0) {
    const leftoverText = unmatchedPhrases.join('\n')
    const shortlist = buildLlmCandidateShortlist(leftoverText, [...directMatchIds], MAX_LLM_CANDIDATES)
    if (shortlist.length > 0) {
      const result = await extractSkillsWithLLM(leftoverText, shortlist)
      llmMatchedIds = result.matchedIds
      if (result.error) {
        console.warn('[skillExtractionService] LLM fallback error (non-fatal, direct matches still returned):', result.error)
      }
      if (result.rejectedIds.length > 0) {
        console.warn('[skillExtractionService] LLM returned id(s) outside the allowed candidate list — discarded:', result.rejectedIds)
      }
    }
  }

  const allIds = new Set([...directMatchIds, ...llmMatchedIds])
  const skills = [...allIds].map((id) => getSkill(id)).filter(Boolean)

  // A phrase only counts as a genuine taxonomy gap if the LLM fallback also
  // failed to place it anywhere — re-check after the LLM pass rather than
  // logging every phrase that merely missed the direct-match step.
  const stillUnmatched = unmatchedPhrases.filter((phrase) => {
    const phraseTokens = new Set(phrase.toLowerCase().split(/\s+/))
    return !llmMatchedIds.some((id) => {
      const label = getSkill(id)?.label?.toLowerCase() ?? ''
      return [...phraseTokens].some((t) => t.length > 3 && label.includes(t))
    })
  })
  logUnmatchedTerms(stillUnmatched)

  return { skills, unmatchedTerms: stillUnmatched }
}
