// Loads the compact ESCO taxonomy (server/data/esco-taxonomy.json, built by
// scripts/build-esco-taxonomy.mjs) plus the hand-curated custom aliases
// (server/data/esco-custom-aliases.json) once into memory, and exposes the
// lookups everything else in this module needs: skill-label matching,
// occupation-label matching, and an occupation's essential/optional skill
// sets. Loaded once at server startup — see server.js.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')

const taxonomy = JSON.parse(readFileSync(path.join(DATA_DIR, 'esco-taxonomy.json'), 'utf8'))
const customAliasesRaw = JSON.parse(readFileSync(path.join(DATA_DIR, 'esco-custom-aliases.json'), 'utf8'))
// Strip the documentation key — everything else is alias -> ESCO Concept URI.
const { _comment: _ignored, ...customAliasesByUri } = customAliasesRaw

// esco-custom-aliases.json pins each alias to a skill's stable ESCO Concept
// URI, never to a compact skill:N id — those ids are just a build-time
// counter over whichever skills survive scripts/build-esco-taxonomy.mjs's
// category filter, so they silently shift on every rebuild whenever that
// filter changes (this is exactly what broke SAP/credit-risk/MIS/Excel/
// Pandas aliases when the HR carve-out was added). Resolved to the CURRENT
// build's skill:N id here, once, at load time — and any alias whose URI
// isn't present in the current taxonomy throws immediately rather than
// silently resolving to nothing or, worse, a coincidentally-valid but wrong
// id. scripts/build-esco-taxonomy.mjs already validates this same
// alias-file-against-taxonomy invariant at build time, so this is defense
// in depth for hand-edits to the alias file made without a full rebuild.
const skillIdByUri = new Map(Object.entries(taxonomy.skills).map(([id, s]) => [s.escoUri, id]))

function resolveCustomAliases(aliasesByUri) {
  const resolved = {}
  const unresolved = []
  for (const [phrase, uri] of Object.entries(aliasesByUri)) {
    const id = skillIdByUri.get(uri)
    if (id) {
      resolved[phrase] = id
    } else {
      unresolved.push(`"${phrase}" -> ${uri}`)
    }
  }
  if (unresolved.length > 0) {
    throw new Error(
      `esco-custom-aliases.json has ${unresolved.length} alias(es) pointing to ESCO URI(s) not present in ` +
        `the current esco-taxonomy.json (likely a rebuilt taxonomy that dropped/changed a skill, or a typo): ` +
        unresolved.join('; ')
    )
  }
  return resolved
}

const customAliases = resolveCustomAliases(customAliasesByUri)

const MAX_NGRAM_WORDS = 8

function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// label-phrase -> id. Built once at module load, in two passes so a
// PREFERRED label always wins a collision over another concept's mere
// ALT label — confirmed necessary, not just defensive: ESCO's own
// "database management systems" skill lists bare "SQL" among ~45 alt
// labels (alongside product names like "Sybase", "Adabas", "TimesTen"),
// which would otherwise silently shadow the dedicated "SQL" skill's own
// preferred label. Within a single pass, later entries still win on a
// genuine tie (harmless — e.g. ESCO has two distinct concepts both
// preferred-labelled exactly "SQL"; either resolves to the same
// real-world skill for our purposes). Custom aliases are treated as
// lowest priority: they only fill gaps neither ESCO pass already claimed,
// so a hand-written alias can never accidentally shadow ESCO's own
// authoritative label for something else.
function buildLabelIndex(items, { includeAliases } = {}) {
  const index = new Map()

  for (const [id, item] of Object.entries(items)) {
    for (const label of [item.label, item.labelDe].filter(Boolean)) {
      const norm = normalize(label)
      if (norm) index.set(norm, id)
    }
  }

  for (const [id, item] of Object.entries(items)) {
    for (const label of [...(item.altLabels || []), ...(item.altLabelsDe || [])]) {
      const norm = normalize(label)
      if (norm && !index.has(norm)) index.set(norm, id)
    }
  }

  if (includeAliases) {
    for (const [phrase, id] of Object.entries(customAliases)) {
      const norm = normalize(phrase)
      if (norm && !index.has(norm)) index.set(norm, id)
    }
  }

  return index
}

const skillLabelIndex = buildLabelIndex(taxonomy.skills, { includeAliases: true })
const occupationLabelIndex = buildLabelIndex(taxonomy.occupations)

// Reverse index: skill id -> its own significant (>2 char) label tokens,
// used only to build a small LLM candidate shortlist (skillExtractionLLM.js)
// without re-tokenizing every skill label on every request.
const skillTokens = new Map()
for (const [id, item] of Object.entries(taxonomy.skills)) {
  const tokens = new Set()
  for (const label of [item.label, ...(item.altLabels || [])]) {
    for (const t of normalize(label).split(' ')) {
      if (t.length > 2) tokens.add(t)
    }
  }
  skillTokens.set(id, tokens)
}

/**
 * Scans `text` for every ESCO skill (or occupation) label/alias/alt-label
 * that appears verbatim as a phrase, via word-bounded n-gram lookup — never
 * a partial-word or substring match. Returns the set of matched ids.
 */
function matchLabelsInText(text, index) {
  const tokens = normalize(text).split(' ').filter(Boolean)
  const matched = new Set()
  for (let start = 0; start < tokens.length; start++) {
    for (let len = Math.min(MAX_NGRAM_WORDS, tokens.length - start); len >= 1; len--) {
      const phrase = tokens.slice(start, start + len).join(' ')
      const id = index.get(phrase)
      if (id) {
        matched.add(id)
        break // longest match at this start position wins; move on
      }
    }
  }
  return matched
}

export function findSkillIdsInText(text) {
  return [...matchLabelsInText(text, skillLabelIndex)]
}

/**
 * Resolves free text (a job title, or a resume's stated role) to the ESCO
 * occupation whose label/altLabel is the LONGEST matching phrase found —
 * the most specific match wins when more than one label matches (e.g.
 * "Senior Data Analyst" should resolve via "data analyst", not a shorter,
 * more generic overlapping label). Returns null when nothing matches —
 * genuinely unresolvable, never guessed.
 */
export function resolveOccupation(text) {
  const tokens = normalize(text).split(' ').filter(Boolean)
  let best = null // { id, len }
  for (let start = 0; start < tokens.length; start++) {
    for (let len = Math.min(MAX_NGRAM_WORDS, tokens.length - start); len >= 1; len--) {
      const phrase = tokens.slice(start, start + len).join(' ')
      const id = occupationLabelIndex.get(phrase)
      if (id && (!best || len > best.len)) {
        best = { id, len }
        break
      }
    }
  }
  if (!best) return null
  const occ = taxonomy.occupations[best.id]
  return { id: best.id, label: occ.label, iscoGroup: occ.iscoGroup }
}

export function getSkill(id) {
  const s = taxonomy.skills[id]
  return s ? { id, label: s.label, categories: s.categories, type: s.type } : null
}

export function getOccupation(id) {
  const o = taxonomy.occupations[id]
  return o ? { id, label: o.label, iscoGroup: o.iscoGroup } : null
}

export function getEssentialSkillIds(occupationId) {
  return taxonomy.occupations[occupationId]?.essentialSkillIds ?? []
}

export function getOptionalSkillIds(occupationId) {
  return taxonomy.occupations[occupationId]?.optionalSkillIds ?? []
}

export function getIscoGroupLabel(code) {
  return taxonomy.iscoGroups[code]
}

/**
 * Builds a bounded shortlist of skill ids for the LLM fallback to choose
 * from — every already-matched id is excluded (no point asking again), and
 * candidates are ranked by token overlap with `text` so the prompt stays a
 * few hundred items even though the full taxonomy has ~2,500 skills. This
 * is what makes "the model may only return ids already in the lookup"
 * enforceable: the model never even sees the full taxonomy, only this
 * pre-filtered, still-verified-server-side candidate list.
 */
export function buildLlmCandidateShortlist(text, excludeIds, maxCandidates) {
  const textTokens = new Set(normalize(text).split(' ').filter((t) => t.length > 2))
  const exclude = new Set(excludeIds)
  const scored = []
  for (const [id, tokens] of skillTokens.entries()) {
    if (exclude.has(id)) continue
    let overlap = 0
    for (const t of tokens) if (textTokens.has(t)) overlap++
    if (overlap > 0) scored.push({ id, overlap })
  }
  scored.sort((a, b) => b.overlap - a.overlap)
  return scored.slice(0, maxCandidates).map(({ id }) => ({ id, label: taxonomy.skills[id].label }))
}

export function isValidSkillId(id) {
  return Object.prototype.hasOwnProperty.call(taxonomy.skills, id)
}

export const meta = taxonomy.meta
