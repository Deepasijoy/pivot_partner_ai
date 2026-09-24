# PivotPartner AI

**Career restart, no border required.**

PivotPartner is an AI-powered career restart copilot for trailing spouses and expatriates who have relocated internationally and are facing barriers to restarting their careers at appropriate seniority and compensation. It matches users to remote, globally-payable jobs, helps close skill gaps, and (long-term) supports the wider relocation journey — banking, healthcare, housing, community.

Built by [Deepa Sijoy](https://linkedin.com/in/deepa-sijoy-8114b91b/) under **Borderless Labs**. Originally built for the DoraHacks "Girls Who Yap × AI" Dora Hack 2.0 hackathon (Top 50 Product Hunt launch day, Top 50 Creators).

- Live app: https://pivot-partner-ai-2.onrender.com/app
- Repo: [`Deepasijoy/pivot_partner_ai`](https://github.com/Deepasijoy/pivot_partner_ai)
- Active branch: `multi-provider-jobs` (Render deploys from this branch, not `main`)

---

## Product pillars

| Pillar | Status | What it does |
|---|---|---|
| **Career & Income** | Active development, Phase 1 focus | Skill-gap analysis → resource recommendations → job matching → CV rewrite |
| **Life Setup** | Launching soon | Relocation guidance — banking, healthcare, housing, education. Housing is live today (Google-search filters, honestly disclaimed as not AI-curated); Banking/Healthcare/Education are visually de-emphasized as not-yet-working |
| **Community** | Launching soon | Peer matching for expats/trailing spouses |

Current strategy: strip scope to Phase 1 (Career & Income, end-to-end working) and prove traction with real users before expanding the other pillars.

## How job matching works

- Live job data is pulled from multiple free/freemium providers — **Adzuna, Arbeitnow, Remotive, Himalayas, JSearch** — merged and deduplicated, with a **direct-from-employer ATS ingest** (Greenhouse, Lever, Ashby) planned as a more reliable, faster-to-query supplement.
- Remotive's free-tier terms prohibit gating its listings behind a login wall used to collect emails, so Remotive results stay visible without login regardless of the app's compulsory-login gate elsewhere.
- Jobs are scored with a single unified scorer (`scoreJob()` / `rankJobsForUser()`): IDF-weighted skill matching, seniority penalties, and hard gates for role-family mismatches, surfaced to users as **fit bands** (Strong Fit / Worth Exploring / Stretch) rather than raw percentages.
- A **Portability/EOR badge** combines legal employability (can this employer/EOR support hiring in the user's country) with remote-friendliness (timezone, async, contract type) into one score on each job card.
- Resume parsing drives skill-gap detection and job-query derivation; this has been an active source of bugs (see **Known issues** below) because keyword/closed-vocabulary matching keeps silently misclassifying resumes it wasn't written for.

## Tech stack

- **Frontend:** Vite + React 18 + TypeScript, Tailwind CSS, Lucide icons
- **Backend:** Node.js + Express, deployed on Render (free tier — cold-starts after ~15 min idle)
- **Database:** Supabase (free tier — auto-pauses on inactivity)
- **AI:** Claude API (primary), OpenAI explored as a reliability fallback
- **Design system:** Fraunces (serif), Public Sans, IBM Plex Mono; seafoam green + warm gold palette — visual design is owned separately, engineering work should not restyle it
- **RAG approach:** precomputed embeddings in JSON + in-memory cosine similarity (appropriate at current corpus size; pgvector is the planned migration once the job index passes ~5,000 items)

## Deployment

Two Render services, confusingly both named `pivot_partner_ai-2` in the dashboard — always confirm by **Service ID**, not name:

| Service | Service ID | Type | URL | Role |
|---|---|---|---|---|
| Backend | `srv-da5o2e8u01pc73fu1j40` | Web | pivot-partner-ai-1.onrender.com | Express API — `/api/chat`, `/api/health`, job providers, Groq calls |
| Frontend | `srv-da5o5ne417fc7384ecrg` | Static Site | pivot-partner-ai-2.onrender.com | `vite build` output; proxies `/api/*` to the backend |

Both deploy from `multi-provider-jobs`. The backend requires a `FRONTEND_URL` environment variable set to the live frontend origin — if it's missing or wrong, chat fails with a generic "Failed to fetch" that looks like a cold-start issue but is actually CORS (see `claude/deployment-notes.md` for the full writeup).


## Contributing / working conventions

- Create a new branch off `multi-provider-jobs` for new work; don't commit directly to it.
- Check `git status` before committing — there are often legitimate uncommitted local changes (e.g. a Supabase health-check addition in `server/server.js`) that should not be swept into an unrelated commit. Avoid blanket `git add -A`.
- Verification bar for engineering changes: `npx tsc -p tsconfig.app.json --noEmit` clean, full existing test suite passing (274+ client tests at last count, plus server tests) — never weaken or delete a test to make it pass.
- Leave a short audit-trail note (see `claude/tin-computer-task-brief.md` for the format) summarizing root cause and what changed, for any non-trivial fix.

## Roadmap highlights

- Ship job-search reliability + honest labeling fixed
- Direct-from-employer job ingest: Greenhouse, Lever, Ashby feeds pulled nightly into Supabase, ranked above aggregator results when fit is equal, labeled "Direct from employer"
- Compulsory Google login gate: first 5 job matches free, "Show more" requires login, no payment yet (payments considered later only if the product gains traction)
- Visa/relocation knowledge base (curated, source-cited, human-reviewed) — deferred post-MVP, 7-week implementation plan drafted
- Taxonomy expansion via Lightcast Open Skills / ESCO for better multilingual and occupation-mapping coverage

