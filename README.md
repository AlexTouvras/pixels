# Pixels

Generate **game-ready pixel art** from a text prompt. Cursor automation drafts the image; a TypeScript pipeline locks it to a hard grid and limited palette.

## Features

- Prompt → Cursor `generateImage` → downsample + seeded k-means → 1× PNG download
- Size presets `16 / 32 / 64 / 128`, palette `8 / 16 / 32` colors

## Local setup

```bash
npm install
cp .env.example .env.local
# CURSOR_API_KEY from https://cursor.com/dashboard/integrations
npm run dev
```

## Vercel

On Vercel, Generate uses a **Cursor cloud agent** (local agents cannot run in serverless).

1. Push this repo to GitHub.
2. Import the project in Vercel (Framework: Next.js).
3. Set env vars:
   - `CURSOR_API_KEY` (required)
   - `CURSOR_CLOUD_REPO_URL=https://github.com/<you>/pixels` (if GitHub metadata is missing)
4. Deploy. `/api/generate` has `maxDuration = 300`.

Linked GitHub deploys usually populate `VERCEL_GIT_REPO_OWNER` / `VERCEL_GIT_REPO_SLUG` automatically.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Local Next.js |
| `npm run build` | Production build |
| `npm test` | Vitest (pixelize) |
| `npm run smoke` | Build + Generate E2E (local) |

## API

`POST /api/generate`

```json
{
  "prompt": "cute slime monster",
  "width": 32,
  "height": 32,
  "colors": 16,
  "transparent": false
}
```

## Stack

Next.js App Router, TypeScript, Tailwind, `@cursor/sdk`, `sharp`, `zod`, `vitest`

## License

MIT
