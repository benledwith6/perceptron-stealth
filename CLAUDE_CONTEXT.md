# Claude Context — Perceptron Stealth (Official AI)

## Project Overview

AI-powered UGC video generation platform. Users onboard by uploading selfies, the system generates character sheets and a welcome video that looks like real smartphone footage.

**Stack:** Next.js 14, Prisma, Supabase (DB + Storage), FAL.ai (video generation), Gemini (character sheets), Tailwind CSS, TypeScript.

**Branch:** `ben/onboarding`

---

## How to Run Locally

```bash
cd /Users/benledwith/perceptron-stealth
npm install
npx prisma generate
npm run dev
# Runs on localhost:3000 (or 3001 if 3000 is taken)
```

**Note:** Node is installed via nvm (`~/.nvm/versions/node/v20.20.0`) and also at `/opt/homebrew/bin/node`. If `npm` isn't found, run:
```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
```

The `.env` file is at the project root (not in git). It contains: `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GOOGLE_AI_STUDIO_KEY`, `FAL_API_KEY`, `SHOTSTACK_API_KEY`, `SHOTSTACK_ENV`.

---

## Onboarding Flow (Welcome Video)

### End-to-End Flow

1. **Photo upload** — User uploads ~4-6 selfies. Stored in Supabase Storage, analyzed for face quality. One marked `isPrimary`.
2. **Character sheet generation** — Gemini takes uploaded photos and generates two composite reference images:
   - **Poses sheet** (3x3 grid, type `"poses"`) — 9 poses: standing, sitting, gesturing, headshot, etc.
   - **360 sheet** (2x3 grid, type `"3d_360"`) — 6 angles: front, 3/4 right, profile, back, etc.
   - Both stored in `characterSheet` table with `compositeUrl` pointing to Supabase Storage.
3. **Welcome video** — Single Kling v3 Pro job via FAL with 3 reference images:
   - `start_image_url` = user's primary photo
   - `elements[0].frontal_image_url` = user's primary photo
   - `elements[0].reference_image_urls` = [poses sheet compositeUrl, 360 sheet compositeUrl]
   - `@Element1` prepended to prompt for character binding
   - Duration: 5 seconds, aspect ratio: 9:16
4. **Polling** — Frontend polls `GET /api/onboarding/preview-video/status?videoId=...` every 5 seconds until FAL completes. Status endpoint polls FAL, downloads video to Supabase Storage on completion, updates DB.
5. **Display** — `PaywallStep` component shows the video when `videoUrl` is populated.

### Key Files

| File | Purpose |
|------|---------|
| `src/app/api/onboarding/preview-video/route.ts` | POST endpoint — gathers 3 images, submits single Kling v3 job |
| `src/app/api/onboarding/preview-video/status/route.ts` | GET endpoint — polls FAL, saves completed video to Supabase |
| `src/lib/generate.ts` | FAL model registry + submission. Contains `kling_v3` config with elements support |
| `src/lib/pipeline/character-assets.ts` | Resolves best reference image for a user (360 > poses > starting frame > photo) |
| `src/lib/character-sheet.ts` | Generates character sheet composites via Gemini |
| `src/app/page.tsx` | Main onboarding page — `generateWelcomeVideo()` + `pollVideoStatus()` |
| `src/components/onboarding/PaywallStep.tsx` | Shows video player or "preview coming soon" based on state |

### Video Generation Model

Using `kling_v3` which maps to `fal-ai/kling-video/v3/pro/image-to-video`:
- Supports `elements` parameter for multi-image character references
- Duration: 3-15 seconds (no clamping needed, unlike kling_2.6 which only allows 5 or 10)
- Prompt limit: **2,500 characters max**
- Elements format: `{ frontal_image_url: string, reference_image_urls: string[] }`
- Reference elements in prompt with `@Element1`

### Current Prompt

Hyperrealistic UGC-style prompt (~2,050 chars) that describes: smartphone footage realism, character fidelity from references, office wardrobe, corporate office setting, iPhone/Samsung camera simulation, mixed office lighting, natural performance with breath/blink beats, lip sync for dialogue, and anti-AI artifact avoidance.

**Script:** "Welcome to AI content — you can now take over the internet."

---

## Architecture Notes

### FAL Integration (`src/lib/generate.ts`)

- All video generation goes through FAL (single API key, single billing)
- Job ID format: `FAL::{status_url}::{response_url}`
- Submission: `POST https://queue.fal.run/{modelId}`
- Polling: `GET {status_url}` then `GET {response_url}` on COMPLETED
- Retry: 2 retries with exponential backoff on submission
- Fallback chain: kling_2.6 -> minimax_hailuo -> wan_2.1 (kling_v3 is NOT in the chain yet)
- Full payload is logged to console: `[FAL] Full payload for ...`

### Old Pipeline (Still Exists, Not Used for Welcome Video)

There's an older multi-cut pipeline in `src/lib/pipeline/orchestrator.ts` that splits scripts into cuts, generates TTS, submits multiple FAL jobs, and stitches via Shotstack. The welcome video does NOT use this — it's a single FAL job. But the pipeline code still exists for other video types.

**Important:** The frontend `pollVideoStatus()` in `page.tsx` was updated to poll the status endpoint directly instead of running old pipeline steps. If someone reverts this, the welcome video will break (it'll try to run expand/tts/anchor/stitch on a single-job video record).

### Database

- Prisma schema at `prisma/schema.prisma`
- PostgreSQL via Supabase (pooled connection on port 6543, direct on 5432)
- Key tables: `User`, `Photo`, `CharacterSheet`, `Video`
- Video records store FAL job ID in `sourceReview` as `{ falJobId: "FAL::..." }`

### Storage

- Supabase Storage bucket: `officialai-media`
- Photos: `photos/{userId}/{photoId}.jpg`
- Character sheets: `character-sheets/{userId}/{sheetId}-poses.png` / `-360.png`
- Videos: `video/{userId}/{videoId}.mp4`

---

## Known Issues

- `POST /api/events` returns 400 frequently — pre-existing event tracking issue, non-blocking
- `kling_v3` is not in the model fallback chain — if FAL rejects the request, no automatic fallback
- Kling v3 prompt has a 2,500 character hard limit — prompts over this silently fail (FAL returns COMPLETED but with a validation error instead of a video URL)
- The `.env` has `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` — these must match the actual port the server runs on

---

## Recent Changes (April 2026)

1. Added `kling_v3` model config to `generate.ts` with elements/multi-image support
2. Rewrote `preview-video/route.ts` — single Kling v3 job with 3 reference images, no TTS, no pipeline
3. Fixed `pollVideoStatus()` in `page.tsx` — polls status endpoint directly instead of running old multi-cut pipeline
4. Added `referenceImageUrls` field to `GenerateVideoParams`
5. Added full payload logging to FAL submission
