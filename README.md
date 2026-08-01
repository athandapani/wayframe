# Wayframe

A generic, point-at-any-program roadmap visualization tool. Type a rough plan, snap a photo
of a whiteboard, or connect a Smartsheet — Wayframe synthesizes it into a clean, swimlane
roadmap you can refine and share.

Status: pre-implementation scaffold. Chartered via a wayfinder map — see the repo's Issues for
the current decision map and open tickets.

## Local Development

```bash
npm install
npm run dev        # start dev server at http://localhost:3000
npm run lint        # eslint
npm run test         # vitest run
npm run build        # next build
```

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS, deployed on Vercel. The Claude API call for
roadmap extraction runs server-side via a Vercel serverless function (`src/app/api/extract`) —
the API key is never exposed client-side.

## License

MIT — see [LICENSE](LICENSE).
