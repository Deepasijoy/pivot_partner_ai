// Builds the compact ESCO taxonomy lookup consumed by server/services/escoTaxonomyService.js.
//
// Source: data/esco/*.csv (ESCO v1.2 CSV export, EN + DE). Trimmed to skill
// areas relevant to PivotPartner's users (digital/ICT, business & admin,
// finance, sales & marketing, education, health, language skills) to stay
// within the ~5,000-item in-memory budget — see the investigation report:
// an untrimmed cut of these 7 categories came to 6,887 items (skills +
// occupations), well over budget, because ESCO's generic "management
// skills" competency branch (supervise staff, manage budgets, ...) is an
// essential requirement on ~2,300 of ESCO's 3,043 occupations — a
// cross-cutting leadership competency, not a business/admin knowledge
// domain. Excluding that one branch (keeping business/admin to its actual
// ISCED-F codes: accounting, management-and-administration, secretarial,
// generic business/admin) brings the total to 4,829 items.
//
// Run: node scripts/build-esco-taxonomy.mjs
// Output: server/data/esco-taxonomy.json

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseCsv } from './lib/csv.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ESCO_DIR = path.join(ROOT, 'data', 'esco');
const OUT_DIR = path.join(ROOT, 'server', 'data');
const OUT_FILE = path.join(OUT_DIR, 'esco-taxonomy.json');

function csv(name) {
  return parseCsv(path.join(ESCO_DIR, name)).records;
}

console.log('Reading ESCO CSVs...');
const skillsEn = csv('skills_en.csv');
const skillsDe = csv('skills_de.csv');
const occEn = csv('occupations_en.csv');
const occDe = csv('occupations_de.csv');
const rel = csv('occupationSkillRelations_en.csv');
const hier = csv('skillsHierarchy_en.csv');
const bsp = csv('broaderRelationsSkillPillar_en.csv');
const digitalColl = csv('digitalSkillsCollection_en.csv');
const langColl = csv('languageSkillsCollection_en.csv');

// --- Build the skill -> top-level-branch resolver (ISCED-F / skill-pillar hierarchy) ---
const parentsOf = new Map(); // uri -> Set(parentUri)
for (const r of bsp) {
  if (!parentsOf.has(r.conceptUri)) parentsOf.set(r.conceptUri, new Set());
  parentsOf.get(r.conceptUri).add(r.broaderUri);
}
const nodeInfo = new Map(); // uri -> {level, code, term}
for (const r of hier) {
  for (const lvl of [0, 1, 2, 3]) {
    const uri = r[`Level ${lvl} URI`];
    if (uri) nodeInfo.set(uri, { level: lvl, code: r[`Level ${lvl} code`], term: r[`Level ${lvl} preferred term`] });
  }
}
function branchesFor(uri) {
  const found = [];
  const seen = new Set();
  let frontier = [uri];
  let hops = 0;
  while (frontier.length > 0 && hops < 15) {
    const next = [];
    for (const u of frontier) {
      if (seen.has(u)) continue;
      seen.add(u);
      const info = nodeInfo.get(u);
      if (info) found.push(info);
      const parents = parentsOf.get(u);
      if (parents) for (const p of parents) next.push(p);
    }
    frontier = next;
    hops++;
  }
  return found;
}

// Scenario B: business/admin restricted to its real ISCED-F codes (accounting,
// management-and-administration, secretarial, generic business/admin) —
// deliberately EXCLUDES the generic "management skills" S-pillar branch
// (supervise staff, manage budgets, lead a team, ...), which is a
// cross-cutting leadership competency present on nearly every occupation,
// not a business/admin knowledge domain. See the module comment above.
const ISCED_F_PREFIXES = {
  business_admin: ['0410', '0413', '0415', '0417', '0419', '040', '049'],
  finance: ['0411', '0412'],
  sales_marketing: ['0414', '0416'],
  education: ['011', '018'],
  health: ['091'],
};

const digitalUris = new Set(digitalColl.map((r) => r.conceptUri));
const langUris = new Set(langColl.map((r) => r.conceptUri));

// Targeted carve-out from the excluded "management skills" branch — added
// after confirming the blanket exclusion gutted HR/recruitment/staff-
// management/payroll occupations specifically (Human Resources Manager
// retained only 6/36 real essential skills, Human Resources Assistant only
// 1/17 — far worse than Data Analyst/Accountant/Software Developer, which
// each retained 100%, since those occupations' essential skills happen to
// live almost entirely in ISCED-F-coded or digital_ict-coded branches
// rather than the generic management-skills branch).
//
// Identified by: (1) essential-skill usage across Human Resources Manager,
// Human Resources Assistant, Operations Manager, Office Manager,
// Administrative Assistant, and (2) a further ~18-occupation cluster of
// direct ISCO/label neighbors (recruitment consultant, talent acquisition
// manager, payroll clerk, HR officer, legal/medical administrative
// assistant, and industry-specific "operations manager" variants) found by
// searching ESCO's own preferred labels for recruitment/personnel/payroll/
// staffing/office-administration terms — NOT the full 2-digit ISCO
// sub-major group (that pulled in unrelated industry-specific management
// occupations: mining, footwear, maritime, rail).
//
// Kept ONLY the skills whose label names a specific recruitment/hiring/
// staffing/payroll/personnel-administration ACTION. Deliberately excludes
// skills that showed up in the same occupations' essential lists but are
// generic managerial/operational verbs merely applied to a business in
// general — budgets, supplies, equipment, logistics, deadlines, generic
// project management, strategic planning — including "supervise staff"
// and "give instructions to staff" themselves, which are about generic
// oversight, not a specific HR/staffing action, and remain excluded
// exactly like "organise work". This is a judgment call, documented here
// so it can be revisited; see the sprint report for the full candidate
// list this was drawn from.
const MANAGEMENT_SKILLS_CARVEOUT = new Set([
  'manage human resources',
  'recruit employees',
  'recruit personnel',
  'hire human resources',
  'manage payroll',
  'manage staff',
  'develop staff',
  'develop training programmes',
  'develop corporate training programmes',
  'organise staff assessment',
  'identify necessary human resources',
  'support employability of people with disabilities',
  'develop employee retention programs',
  'evaluate employees',
  'manage personnel agenda',
  'assess character',
  'profile people',
  'analyse staff capacity',
  'provide feedback on job performance',
]);

function categoriesFor(uri, label) {
  const cats = new Set();
  if (digitalUris.has(uri)) cats.add('digital_ict');
  if (langUris.has(uri)) cats.add('language');
  for (const b of branchesFor(uri)) {
    if (b.term === 'working with computers') cats.add('digital_ict');
    for (const [cat, prefixes] of Object.entries(ISCED_F_PREFIXES)) {
      if (b.code && prefixes.some((p) => b.code === p || b.code.startsWith(p))) cats.add(cat);
    }
  }
  if (cats.size === 0 && MANAGEMENT_SKILLS_CARVEOUT.has(label)) {
    cats.add('hr_staff_management');
  }
  return cats;
}

console.log('Categorizing skills...');
const skillIdByUri = new Map(); // esco skill uri -> compact id
const skills = {}; // compact id -> record
let skillCounter = 0;

const skillsDeByUri = new Map(skillsDe.map((r) => [r.conceptUri, r]));

for (const s of skillsEn) {
  const cats = categoriesFor(s.conceptUri, s.preferredLabel);
  if (cats.size === 0) continue;

  const id = `skill:${skillCounter++}`;
  skillIdByUri.set(s.conceptUri, id);

  const de = skillsDeByUri.get(s.conceptUri);
  const altLabelsEn = s.altLabels ? s.altLabels.split('\n').map((x) => x.trim()).filter(Boolean) : [];
  const altLabelsDe = de?.altLabels ? de.altLabels.split('\n').map((x) => x.trim()).filter(Boolean) : [];

  skills[id] = {
    escoUri: s.conceptUri,
    label: s.preferredLabel,
    labelDe: de?.preferredLabel || undefined,
    altLabels: altLabelsEn,
    altLabelsDe: altLabelsDe,
    type: s.skillType || 'skill/competence',
    categories: [...cats],
  };
}

console.log(`Kept ${Object.keys(skills).length} skills.`);

// --- Occupations: kept iff >=1 ESSENTIAL relation to a kept skill ---
console.log('Deriving relevant occupations...');
const essentialByOccUri = new Map(); // occUri -> Set(skillId)
const optionalByOccUri = new Map();

for (const r of rel) {
  const skillId = skillIdByUri.get(r.skillUri);
  if (!skillId) continue; // skill not in our filtered vocabulary
  const bucket = r.relationType === 'essential' ? essentialByOccUri : optionalByOccUri;
  if (!bucket.has(r.occupationUri)) bucket.set(r.occupationUri, new Set());
  bucket.get(r.occupationUri).add(skillId);
}

const occDeByUri = new Map(occDe.map((r) => [r.conceptUri, r]));
const occupations = {};
let occCounter = 0;

for (const o of occEn) {
  const essential = essentialByOccUri.get(o.conceptUri);
  if (!essential || essential.size === 0) continue; // no essential skill in our vocabulary

  const id = `occ:${occCounter++}`;
  const de = occDeByUri.get(o.conceptUri);
  const altLabelsEn = o.altLabels ? o.altLabels.split('\n').map((x) => x.trim()).filter(Boolean) : [];
  const altLabelsDe = de?.altLabels ? de.altLabels.split('\n').map((x) => x.trim()).filter(Boolean) : [];
  const optional = optionalByOccUri.get(o.conceptUri);

  occupations[id] = {
    escoUri: o.conceptUri,
    label: o.preferredLabel,
    labelDe: de?.preferredLabel || undefined,
    altLabels: altLabelsEn,
    altLabelsDe: altLabelsDe,
    iscoGroup: o.iscoGroup,
    essentialSkillIds: [...essential],
    optionalSkillIds: optional ? [...optional] : [],
  };
}

console.log(`Kept ${Object.keys(occupations).length} occupations.`);

// --- ISCO group labels, for display/debugging only ---
const iscoRecords = csv('ISCOGroups_en.csv');
const iscoGroups = {};
for (const r of iscoRecords) {
  iscoGroups[r.code] = r.preferredLabel;
}

const output = {
  meta: {
    generatedAt: new Date().toISOString(),
    source: 'ESCO v1.2 (https://esco.ec.europa.eu/)',
    skillCount: Object.keys(skills).length,
    occupationCount: Object.keys(occupations).length,
    totalItems: Object.keys(skills).length + Object.keys(occupations).length,
    categories: Object.keys(ISCED_F_PREFIXES).concat(['digital_ict', 'language', 'hr_staff_management']),
  },
  skills,
  occupations,
  iscoGroups,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(output));
console.log(`\nWrote ${OUT_FILE}`);
console.log(`Total items: ${output.meta.totalItems} (skills: ${output.meta.skillCount}, occupations: ${output.meta.occupationCount})`);
