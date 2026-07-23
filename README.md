# Pumabench Results Dashboard

Next.js app that visualizes benchmark results from `results/<model>/<timestamp>-area-<n>.json`.

- **Overview (`/`)** — all models ranked by overall score (mean of the 4 area scores), with a bar chart and a table.
- **Model detail (`/model/<model>`)** — per-area bar chart plus, for each area, a per-subject bar chart and table (questions / correct / percentage).
- Models with multiple runs (several timestamps in the same folder) are shown as the **average across runs**.

## Run locally

```bash
npm install
npm run dev   # http://localhost:3000
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
