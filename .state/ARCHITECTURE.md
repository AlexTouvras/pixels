# Architecture (working log)

> Tracked in git. Living decisions for this repo.

## Overview

Pixels generates game-ready pixel art: Cursor automation (`generateImage`) drafts an image, then TypeScript pixelize locks grid + palette. Product UI is **Generate-only**.

## Runtimes

| Where | Agent | Notes |
|-------|--------|------|
| Local `npm run dev` | Cursor SDK **local** agent | `tools: ["generateImage"]` only |
| Vercel | Cursor SDK **cloud** agent | Needs `CURSOR_API_KEY` + repo URL (`CURSOR_CLOUD_REPO_URL` or Vercel Git metadata) |

## Dependencies

| Dependency | Why | Date |
|------------|-----|------|
| next/react | Web app | 2026-08-11 |
| @cursor/sdk | Image draft via generateImage | 2026-08-11 |
| sharp | PNG decode/encode | 2026-08-11 |
| zod | Request validation | 2026-08-11 |
| vitest | Pixelize unit tests | 2026-08-11 |

## Key decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-08-11 | Cursor not OpenAI | User request |
| 2026-08-11 | Generate-only UI | Snap not useful for this product |
| 2026-08-11 | Cloud agent on Vercel | Local executor cannot run in serverless |
