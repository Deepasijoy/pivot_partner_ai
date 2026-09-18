# PivotPartner AI

An AI career and relocation copilot — resume-to-job matching, skill-gap analysis, and career-path guidance.

## Data sources

**Skill and occupation taxonomy: [ESCO](https://esco.ec.europa.eu/en) (European Skills, Competences, Qualifications and Occupations), European Commission.**
Job/resume skill extraction and occupation/role-family matching (`server/services/escoTaxonomyService.js`, `src/services/escoTaxonomyClient.ts`, `src/services/occupationMatchingService.ts`) are built on a compact subset of ESCO v1.2's skills, occupations, and occupation-skill relations, trimmed to skill areas relevant to this app's users (digital/ICT, business & admin, finance, sales & marketing, education, health, language skills) — see `scripts/build-esco-taxonomy.mjs` for exactly how, and `server/data/esco-custom-aliases.json` for the small set of hand-curated aliases (e.g. "Power BI" → ESCO's "business intelligence") that ESCO has no dedicated skill for. ESCO data is licensed under the [EUPL](https://esco.ec.europa.eu/en/use-esco/copyright-legal-notice) via the European Commission; this app is not affiliated with or endorsed by the European Commission.

Role-family matching (same/adjacent/unrelated occupation) is derived from ESCO occupations' [ISCO-08](https://www.ilo.org/public/english/bureau/stat/isco/isco08/) group codes.

### ESCO data setup

The raw ESCO CSV export (`data/esco/*.csv`, ~80MB) is **not committed** — it's gitignored (see `.gitignore`). Only the compact, generated outputs derived from it are committed and used at runtime:
- `server/data/esco-taxonomy.json` (~3MB) — loaded by `server/services/escoTaxonomyService.js` at server startup.
- `src/data/escoTaxonomyClient.data.ts` (~1.7MB) — imported directly into the frontend bundle by `src/services/escoTaxonomyClient.ts`.

A fresh clone works out of the box from those two committed files alone — you only need the raw CSVs if you're changing the taxonomy itself (adding a skill category, adjusting the HR/staff-management carve-out, moving to a newer ESCO release, etc.).

**To rebuild from scratch:**
1. Download the ESCO classification (CSV format, English + German) from the [ESCO download portal](https://esco.ec.europa.eu/en/use-esco/download) — this project was built against v1.2.0. You need the full "Classification" CSV bundle (skills, occupations, occupation-skill relations, ISCO groups, skill/occupation hierarchies, and the digital/language skill collections).
2. Extract the CSVs directly into `data/esco/` (flat, no subfolders) — filenames should match what's already referenced in `scripts/build-esco-taxonomy.mjs` (e.g. `skills_en.csv`, `occupations_en.csv`, `occupationSkillRelations_en.csv`, `ISCOGroups_en.csv`, `skillsHierarchy_en.csv`, `broaderRelationsSkillPillar_en.csv`, `digitalSkillsCollection_en.csv`, `languageSkillsCollection_en.csv`, plus the `_de` counterparts for `skills`/`occupations`).
3. Run:
   ```
   node scripts/build-esco-taxonomy.mjs
   node scripts/build-esco-client-bundle.mjs
   ```
   This regenerates both committed output files above. Re-run these two scripts (and re-commit the outputs) any time `scripts/build-esco-taxonomy.mjs`'s category filters, the HR/staff-management carve-out list, or `server/data/esco-custom-aliases.json` change.

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
