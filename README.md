# Wayframe

A generic, point-at-any-program roadmap visualization tool. Type a rough plan, snap a photo
of a whiteboard, upload a CSV, or connect a Smartsheet — Wayframe synthesizes it into a clean,
swimlane roadmap you can refine, correct in plain English, and share.

**Live:** [wayframe-athandapani-8888s-projects.vercel.app](https://wayframe-athandapani-8888s-projects.vercel.app)

Chartered and built via a wayfinder map — see the repo's Issues for the decision history
([#3](https://github.com/athandapani/wayframe/issues/3),
[#20](https://github.com/athandapani/wayframe/issues/20)) and open tickets.

## What it does

- **Unified ingestion** — pasted notes, a photo of a whiteboard/napkin sketch, a CSV upload, or
  a live Smartsheet pull all feed one Claude extraction call into a shared roadmap schema.
- **Two views** — a full milestone-level Program timeline (swimlanes, dependency connectors,
  duration pills, a computed critical path) and a risk-first Executive view (RAG rollups per
  lane, top risks, a compact critical-path timeline strip) for a two-minute read.
- **AI correction box** — describe a change in plain English ("delay UL 3100 by two weeks");
  see a preview before it commits, with multi-step undo shared across AI and manual edits.
- **Manual editing** — a modal editor for milestones and top-level items, cascading dependent
  dates automatically.
- **Ghost rendering** — a slipped milestone shows a `+/-Nd` badge or dashed outline against its
  original date, your choice, so schedule drift stays visible instead of silently overwritten.
- **Export to Deck** — one click captures both views as a PowerPoint (`.pptx`).
- **Save/open** — round-trip a roadmap to a `.wayframe.json` file.
- **Themes and swimlane management** — three OKLCH-generated themes; add, rename, reorder, and
  delete lanes.

## Local Development

```bash
npm install
npm run dev        # start dev server at http://localhost:3000
npm run lint        # eslint
npm run test         # vitest run
npm run build        # next build
```

Extraction and AI corrections need a live key:

```bash
# .env.local
ANTHROPIC_API_KEY=sk-...
SMARTSHEET_API_TOKEN=...   # optional, only for the Smartsheet import path
```

Without a key, `/api/extract` and `/api/correct` fail closed with a typed error rather than
silently returning bad data — everything else in the app (the `/dev/demo-roadmap` QA route,
manual editing, export, themes) works without one.

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS, deployed on Vercel via GitHub auto-deploy on
push to `master`. The Claude API calls (extraction, corrections) run server-side via Vercel
serverless functions (`src/app/api/`) — the API key is never exposed client-side.

## License

MIT — see [LICENSE](LICENSE).
