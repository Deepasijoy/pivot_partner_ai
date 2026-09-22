// Client-side ESCO taxonomy lookup — a slim, English-only bundle
// (src/data/escoTaxonomyClient.json, built by
// scripts/build-esco-client-bundle.mjs from the full server-side taxonomy)
// used for synchronous skill/occupation matching against job listings.
//
// Deliberately synchronous and network-free, unlike the server's
// escoTaxonomyService.js: job listings are numerous and transient (a single
// search can return dozens across Local/Hybrid/Remote), and every existing
// provider adapter/aggregator call site (jobAggregatorService.ts's
// toJobOpportunity, all 5 provider mappers) already assumes synchronous
// skill detection — keeping this synchronous means none of that, or its
// existing tests, needed to change. The one place a network round trip
// (and the Groq fallback for genuinely unmatched text) earns its cost is
// resume parsing, a one-time, high-value document — see
// resumeParserService.ts and its call to the server's /api/skills/extract.
//
// This file never talks to Groq and never invents a match — it is pure
// label/alias substring lookup, the exact same mechanism
// escoTaxonomyService.js uses server-side, reimplemented here rather than
// shared, since one runs in the browser bundle and one in the Node server
// process.

import taxonomy from '../data/escoTaxonomyClient.data';
import type { Skill } from '../types';

interface ClientSkillEntry {
  label: string;
  altLabels: string[];
  categories: string[];
}
interface ClientOccupationEntry {
  label: string;
  altLabels: string[];
  iscoGroup: string;
  essentialSkillIds: string[];
}
interface ClientTaxonomy {
  skills: Record<string, ClientSkillEntry>;
  occupations: Record<string, ClientOccupationEntry>;
  // A phrase's value is a single skill id, or an ARRAY of ids for a
  // dual/multi-ID alias (e.g. "excel" -> both "use microsoft office" and
  // "use spreadsheets software" — see server/data/esco-custom-aliases.json's
  // own header comment for why).
  customAliases: Record<string, string | string[]>;
}

const data = taxonomy as unknown as ClientTaxonomy;

const MAX_NGRAM_WORDS = 8;

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Two-pass build, same reasoning as escoTaxonomyService.js: a concept's own
// PREFERRED label always wins a collision over another concept's mere ALT
// label (confirmed necessary — ESCO's "database management systems" skill
// lists bare "SQL" as one of ~45 alt labels, which would otherwise shadow
// the dedicated "SQL" skill). Custom aliases fill gaps only, lowest
// priority, so a hand-written alias can never shadow ESCO's own label for
// something else.
function buildLabelIndex<T extends { label: string; altLabels: string[] }>(
  items: Record<string, T>,
  customAliases?: Record<string, string | string[]>
): Map<string, string | string[]> {
  const index = new Map<string, string | string[]>();
  for (const [id, item] of Object.entries(items)) {
    const norm = normalize(item.label);
    if (norm) index.set(norm, id);
  }
  for (const [id, item] of Object.entries(items)) {
    for (const label of item.altLabels) {
      const norm = normalize(label);
      if (norm && !index.has(norm)) index.set(norm, id);
    }
  }
  if (customAliases) {
    for (const [phrase, id] of Object.entries(customAliases)) {
      const norm = normalize(phrase);
      if (norm && !index.has(norm)) index.set(norm, id);
    }
  }
  return index;
}

// Occupations never receive customAliases, so occupationLabelIndex entries
// are always a single id — resolveEscoOccupation() below relies on that.
const skillLabelIndex = buildLabelIndex(data.skills, data.customAliases);
const occupationLabelIndex = buildLabelIndex(data.occupations);

function matchLabelsInText(text: string, index: Map<string, string | string[]>): Set<string> {
  const tokens = normalize(text).split(' ').filter(Boolean);
  const matched = new Set<string>();
  for (let start = 0; start < tokens.length; start++) {
    for (let len = Math.min(MAX_NGRAM_WORDS, tokens.length - start); len >= 1; len--) {
      const phrase = tokens.slice(start, start + len).join(' ');
      const id = index.get(phrase);
      if (id) {
        if (Array.isArray(id)) {
          for (const singleId of id) matched.add(singleId);
        } else {
          matched.add(id);
        }
        break;
      }
    }
  }
  return matched;
}

export interface ResolvedOccupation {
  id: string;
  label: string;
  iscoGroup: string;
  essentialSkillIds: string[];
}

/**
 * Finds every ESCO skill (via ESCO's own label/alt-labels or our custom
 * alias file — see server/data/esco-custom-aliases.json) that appears
 * verbatim as a phrase in `text`, and maps each to the app's existing
 * `Skill` shape. Category/demand/proficiency are derived deterministically
 * from the ESCO record — never invented per-candidate, so the same skill
 * always carries the same weight everywhere it's detected.
 */
export function findEscoSkillsInText(text: string): Skill[] {
  const ids = matchLabelsInText(text, skillLabelIndex);
  const skills: Skill[] = [];
  for (const id of ids) {
    const entry = data.skills[id];
    if (!entry) continue;
    skills.push({
      name: entry.label,
      category: entry.categories.includes('digital_ict') ? 'technical' : 'business',
      demandLevel: 'medium',
      proficiency: 75,
      escoId: id,
    });
  }
  return skills;
}

/**
 * Resolves free text (a job title, or a resume's stated role) to the ESCO
 * occupation whose label/altLabel is the LONGEST matching phrase — the most
 * specific match wins when more than one label matches. Returns null when
 * nothing matches — genuinely unresolvable (a real, honest outcome; ESCO
 * has no dedicated occupation for many vendor/product-specific titles, e.g.
 * "SAP AMS Consultant" — see README.md's ESCO section), never guessed.
 */
export function resolveEscoOccupation(text: string): ResolvedOccupation | null {
  const tokens = normalize(text).split(' ').filter(Boolean);
  let best: { id: string; len: number } | null = null;
  for (let start = 0; start < tokens.length; start++) {
    for (let len = Math.min(MAX_NGRAM_WORDS, tokens.length - start); len >= 1; len--) {
      const phrase = tokens.slice(start, start + len).join(' ');
      const id = occupationLabelIndex.get(phrase);
      // occupationLabelIndex never actually holds an array (see its own
      // comment above) — this guard just narrows the shared Map type back
      // to a single id for TS.
      if (id && !Array.isArray(id) && (!best || len > best.len)) {
        best = { id, len };
        break;
      }
    }
  }
  if (!best) return null;
  const occ = data.occupations[best.id];
  if (!occ) return null;
  return { id: best.id, label: occ.label, iscoGroup: occ.iscoGroup, essentialSkillIds: occ.essentialSkillIds };
}

export function getEscoSkillLabel(id: string): string | undefined {
  return data.skills[id]?.label;
}

/** Maps an ESCO skill id back to the app's existing `Skill` shape — used to
 * turn an occupation's essentialSkillIds into displayable Skill objects for
 * scoring/skill-gap purposes, without re-scanning any text. */
export function getEscoSkillById(id: string): Skill | undefined {
  const entry = data.skills[id];
  if (!entry) return undefined;
  return {
    name: entry.label,
    category: entry.categories.includes('digital_ict') ? 'technical' : 'business',
    demandLevel: 'medium',
    proficiency: 75,
    escoId: id,
  };
}
