# AGENTS.md

## Project overview

PumaBench benchmarks LLMs against the UNAM university admission test. Two distinct parts:

- **`data/`** — Ruby benchmark tooling, test questions, raw answers, and scored results
- **Root (`app/`, `components/`, `lib/`)** — Next.js 15 dashboard that visualizes results

## Commands

```bash
npm install          # install deps (Node 25 via mise)
npm run dev          # http://localhost:3000
npm run build        # production build (reads data/results.csv at build time)
```

No lint, typecheck, test, or formatter scripts are configured. After changes, verify with `npm run build`.

### Benchmark (from `data/` directory)

```bash
ruby benchmark.rb <model-id> --provider=openrouter [--effort=low|medium|high]
ruby benchmark.rb <model-id> --provider=openrouter --effort=high --resume   # continue interrupted run
ruby benchmark.rb --evaluate-only                                            # re-score existing CSVs, no LLM calls
ruby export_models.rb                                                        # refresh data/models.json with HF param counts
```

Benchmark requires `OPENROUTER_API_KEY` in `.env`.

## Data flow

1. `data/test/2025/area-{1..4}.json` — source test questions (4 areas, 120 questions each)
2. `data/answers/<model>/` — raw LLM answer CSVs per model
3. `data/results/<model>/<timestamp>-area-<n>.json` — per-area scored results
4. **`data/results.csv`** — aggregated scores; **the single source of truth the dashboard reads**
5. `data/models.json` — model metadata (provider info, parameter counts from HuggingFace)

After running benchmarks or modifying result JSONs, `results.csv` must be regenerated (via `--evaluate-only`) for the dashboard to reflect changes. The dashboard does **not** read individual result JSONs.

## Architecture notes

- **All pages are server components** using App Router. Data is loaded via `lib/data.ts` which parses `data/results.csv` synchronously with `fs.readFileSync`.
- `generateStaticParams` + `dynamicParams = false` on `/model/[model]` — all model slugs must exist in the CSV at build time.
- Path alias: `@/*` maps to project root (e.g. `@/lib/data`, `@/components/OverviewChart`).
- Charts use **Recharts**. Compare page (`/compare`) uses a client component (`CompareClient`).
- Styling is plain CSS in `app/globals.css` — no Tailwind, no CSS modules.
- `.env` is loaded by mise and contains `OPENROUTER_API_KEY`. Never commit secrets.

## Conventions

- Area numbers are 1-4, mapped to Spanish names in `lib/data.ts` (`AREA_NAMES`).
- Model identity in the CSV is `model` + `effort` columns; composite key in UI is `${model}::${effort}`.
- `QUESTIONS_PER_AREA = 120` is hardcoded in `lib/data.ts`.
- Result JSON filenames follow `<YYYYMMDDHHMMSS>-area-<n>.json`. Multiple timestamps per model = multiple runs (averaged).
