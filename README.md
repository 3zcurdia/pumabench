# PumaBench

**What happens when an LLM takes the UNAM admission test?**

PumaBench is an academic exercise that evaluates open and closed LLMs against the UNAM admission test — Mexico's most selective public university entrance exam. The 480 questions (4 areas × 120 questions each) were scraped from [pumabecas.com](https://pumabecas.com/), which hosts a simulation of the 2025 evaluation. This project serves as a reference benchmark for LLM capabilities in Spanish.

## Dashboard

Next.js app that visualizes benchmark results from `results/<model>/<timestamp>-area-<n>.json`.

- **Overview (`/`)** — all models ranked by overall score (mean of the 4 area scores), with a bar chart and a table.
- **Model detail (`/model/<model>`)** — per-area bar chart plus, for each area, a per-subject bar chart and table (questions / correct / percentage).
- Models with multiple runs (several timestamps in the same folder) are shown as the **average across runs**.

## Run a benchmark

From the `data/` directory:

```bash
# Run all 4 areas for a single model
ruby benchmark.rb <model-id> --provider=openrouter [--effort=low|medium|high]

# Continue an interrupted run instead of starting over with a new timestamp
ruby benchmark.rb <model-id> --provider=openrouter --effort=high --resume

# Re-score every existing CSV in data/answers/ (no LLM calls)
ruby benchmark.rb --evaluate-only
```

When `--resume` is passed, the script finds the latest in-progress answer CSV for the model, reuses its timestamp, skips already-answered questions (including `ERROR` rows), and only asks the LLM for the missing ones. The `timestamp` field inside each per-area result JSON is updated to the resume time.

### Run with Jev (TypeSafe)

Jev is a System One decision model: it does not write text. It takes a `state` plus typed questions and returns typed answers. PumaBench maps each exam question to one [TypeSafe `choice` primitive](https://docs.typesafe.ai/primitives/choice):

- `state` holds the subject, the reference text, and the question stem
- `questions.answer.criteria` holds the four options
- the returned `choice` (`A`–`D`) is the answer

```bash
# Requires TYPESAFE_API_KEY in .env
ruby benchmark.rb typesafe/jev-latest --provider=typesafe

# Inspect the request bodies without calling the API
ruby benchmark.rb typesafe/jev-latest --provider=typesafe --dry-run
```

One request per exam question, so the run is comparable with the LLM rows. The native TypeSafe API accepts `jev-latest`, `jev-preview`, and pinned ids like `jev-1.13.0` — it rejects `jev-1.13`. Jev has no thinking knob: `--effort` is rejected (except `none`) and the `results.csv` row is labelled `effort=none`. Alongside each answer CSV, a `<timestamp>-area-<n>.jsonl` sidecar records `choice`, `confidence`, `probabilities`, and `usage` for later calibration analysis.

### Run with Kev (self-hosted System One)

[Kev](https://github.com/jaredpalmer/kev) is an open-source System One server that speaks the same API as TypeSafe. Start it for one checkpoint, then point the benchmark at it with `--provider=typesafe` and `--api_base`.

```bash
# In one terminal
uv run --extra serve python -m kev.serve --run jaredpalmer/kev-4b --port 8009

# In another terminal
ruby benchmark.rb kev-4b --provider=typesafe --api_base=http://127.0.0.1:8009/v1
```

The bare model name (`kev-4b`) becomes the answers directory and the `results.csv` row. The server decides which checkpoint to load via its own `--run` flag, so the name in the benchmark is only a label. The key is optional for a local server; pass `--api_key` only if the server requires one (e.g. Modal). The request format, sidecar, and `--effort` rules are the same as Jev.

## Run locally

```bash
npm install
npm run dev         # http://localhost:3000
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
```

## Production build

```bash
npm run build
npm start
```

## Deploy to Vercel

The app is a standard Next.js project — no extra config needed:

```bash
npx vercel
```

or import the repo in the Vercel dashboard (framework preset: **Next.js**). Data from `results/` is read at build time, so redeploy after adding new result files.
