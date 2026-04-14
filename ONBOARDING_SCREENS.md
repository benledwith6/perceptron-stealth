# Onboarding Screens — Handoff Spec

**Purpose:** Spec for the onboarding flow. Reconciles the [Google Sheet audit](https://docs.google.com/spreadsheets/d/1vyABlBzv51kh-3m-HXsYUgfAFEw2Zz-wNmHn-ujuriQ/edit?usp=sharing) against actual codebase state. Hand this to the implementing agent.

**Date:** 2026-04-13
**Branch context:** `ben/dev-v2`. Uncommitted changes currently touch [src/app/api/onboarding/voice/route.ts](src/app/api/onboarding/voice/route.ts), [src/app/page.tsx](src/app/page.tsx), and [src/components/onboarding/PhotoChoice.tsx](src/components/onboarding/PhotoChoice.tsx). Review those before editing — they are in-progress work.

**Scope:** Onboarding only (sheet rows 36–80: Pre-Signup Onboarding, Paywall & Checkout, First Value Delivery). NOT the full 187-row lifecycle.

---

## ⚠️ Audit corrections — READ FIRST

The Google Sheet's "Codebase Reference" column is **unreliable**. The following items are marked "Yes" in the sheet but **do not exist** in the repo as of 2026-04-13:

| Sheet row | Claimed path / item | Reality |
|---|---|---|
| 72 | `src/app/dashboard/welcome/page.tsx` | **Missing** — no `/dashboard/welcome` route |
| 74 | `src/lib/research-agents.ts` | **Missing** |
| 74–78 | `src/app/api/research/launch\|status\|approve\|regenerate-day/route.ts` | **Missing** — entire `src/app/api/research/` folder does not exist |
| 74 | `ResearchSession` Prisma model | **Missing** from [prisma/schema.prisma](prisma/schema.prisma) |

**Rule for the next agent:** verify every path from the sheet with `Glob` or `ls` before referencing or importing it. Assume the sheet is a wishlist, not an inventory.

Other landmines:
- **Character sheet does NOT produce 9 individual image URLs.** It produces one composite grid image. Position metadata (row/col) lives in the `CharacterSheetImage.angle` JSON field. All 10 `CharacterSheetImage` rows per sheet point to the same composite URL.
- **`voiceId` is async.** [src/app/api/onboarding/voice/route.ts](src/app/api/onboarding/voice/route.ts) kicks off cloning in the background and returns `voiceId: null` immediately. Downstream code must tolerate null and poll.
- **There is no research/calendar generation during onboarding today.** The dashboard calendar at [src/app/dashboard/calendar/CalendarClient.tsx](src/app/dashboard/calendar/CalendarClient.tsx) only shows static suggestions from [src/app/api/calendar/suggestions/route.ts](src/app/api/calendar/suggestions/route.ts) post-dashboard.

---

## Intended onboarding flow (per sheet)

```
1.  Landing Page (theofficial.ai)
2.  /demo (pre-signup, optional entry)
3.  Step 1: Upload Photo                      (camera or file)
4.  Step 2: Character Sheet                   (AI generates 9 poses)
5.  Pick Your Best Pose                       (3×3 grid selection)
6.  Step 3: Voice Clone                       (record 5+ seconds)
7.  Step 4: Paywall                           (preview video + pricing)
8.  Stripe Checkout                           ($79/mo, 7-day trial)
9.  Create Account                            (email + password)
10. Welcome Page                              (select industry + company)
11. AI Deep Research                          (generates 30-day calendar)
12. Review Content Strategy                   (scripts, captions, schedule)
13. Edit Strategy                             (modify scripts/schedule)
```

---

## Per-screen spec

Legend: ✅ Exists · 🟡 Partial · 🔴 Missing

### 1. Landing Page ✅
- **Files:** [src/app/page.tsx](src/app/page.tsx) (594 lines; wraps full flow as `OnboardingFlow()`)
- **Transition:** "Let's go" button → sets `step = "photo_choice"`.
- **No action needed.**

### 2. /demo (pre-signup) ✅
- **Files:** [src/app/demo/page.tsx](src/app/demo/page.tsx), [src/app/demo/DemoClient.tsx](src/app/demo/DemoClient.tsx)
- **Notes:** Standalone, no auth. Mock processing animation → "sign up to download" overlay. Not integrated with authenticated onboarding. Leave as-is unless explicitly asked to unify.

### 3. Upload Photo ✅
- **Files:** [src/components/onboarding/PhotoChoice.tsx](src/components/onboarding/PhotoChoice.tsx) (rendered from [src/app/page.tsx](src/app/page.tsx) when `step === "photo_choice"`)
- **API:** [src/app/api/photos/route.ts](src/app/api/photos/route.ts), [src/app/api/upload/route.ts](src/app/api/upload/route.ts)
- **Transition:** Camera → `photo_capture`; upload → `voice`. Photo URLs carried in component state.
- **⚠️ Currently being edited on `ben/dev-v2`.** Coordinate with the in-progress work before modifying.

### 4. Character Sheet (generation) ✅
- **Files:** [src/app/api/character-sheet/route.ts](src/app/api/character-sheet/route.ts), [src/lib/character-sheet.ts](src/lib/character-sheet.ts)
- **Prisma models:** `CharacterSheet` (id, userId, type [`poses`|`3d_360`], compositeUrl, status) and `CharacterSheetImage` (id, characterSheetId, url, position [Int], angle [JSON: row/col/label/suitableFor/isCropped])
- **Triggered from:** [src/app/page.tsx](src/app/page.tsx) `startCharacterSheetGeneration()` around lines 232–258, after photo upload (~line 370) or camera capture (~line 352)
- **Returns:** `{poses: {id, compositeUrl, status, imageCount}, threeD: {id, status}}`. **Only a composite** — positions 1–9 are metadata, not cropped images.

### 5. Pick Your Best Pose 🟡
- **Current files:** [src/components/onboarding/CharacterSheetReveal.tsx](src/components/onboarding/CharacterSheetReveal.tsx) (rendered from [src/app/page.tsx](src/app/page.tsx) when `step === "character_reveal"`)
- **Gap:** Shows the composite image and lets the user tap-to-select the whole sheet. There is NO 3×3 grid, no individual pose selection. Sheet row 41 ("Partial / UI not confirmed") is accurate.
- **Build spec for next agent:**
  - **Inputs:** `characterSheetId`, `compositeUrl`, and the 9 `CharacterSheetImage` rows (positions 1–9, each with `angle` JSON containing `row`/`col` in the composite).
  - **UI:** Render the composite as a 3×3 grid by client-side cropping using the `row`/`col` metadata (CSS `background-image` + `background-position`, or `<canvas>` crops). Each tile is selectable; selected tile highlights.
  - **Persistence:** On confirm, PATCH `CharacterSheet` with a new `selectedPosition` Int column (requires Prisma migration), or add a `selectedPosition` field to the `angle` JSON of the chosen row. Prefer a new column — simpler to query.
  - **Transition:** On confirm, advance to `step = "voice"` (or wherever the current flow goes next — confirm with [src/app/page.tsx](src/app/page.tsx) state machine).
  - **Fallback:** If no selection after N seconds or user taps "pick for me", auto-select position 1.

### 6. Voice Clone ✅
- **Files:** [src/components/onboarding/VoiceCapture.tsx](src/components/onboarding/VoiceCapture.tsx), [src/app/api/onboarding/voice/route.ts](src/app/api/onboarding/voice/route.ts)
- **Prisma model:** `VoiceSample` (id, userId, filename, url, duration, isDefault, voiceCloneId, provider)
- **Pattern:** Route uploads audio → creates `VoiceSample` with `voiceCloneId: null` → fires off clone in background → returns `{success: true, cloning: true, voiceId: null}`. Client must NOT block on `voiceId`; poll separately if needed.
- **⚠️ Currently being edited on `ben/dev-v2`.**

### 7. Paywall ✅
- **Files:** [src/components/onboarding/PaywallStep.tsx](src/components/onboarding/PaywallStep.tsx), [src/app/api/onboarding/preview-video/route.ts](src/app/api/onboarding/preview-video/route.ts), [src/app/api/onboarding/preview-video/status/route.ts](src/app/api/onboarding/preview-video/status/route.ts)
- **Transition:** "Subscribe" → POST `/api/stripe/checkout` → Stripe-hosted page. "Skip for now" → POST `/api/onboarding/complete`.

### 8. Stripe Checkout ✅
- **Files:** [src/app/api/stripe/checkout/route.ts](src/app/api/stripe/checkout/route.ts), [src/app/api/stripe/webhook/route.ts](src/app/api/stripe/webhook/route.ts), [src/lib/stripe.ts](src/lib/stripe.ts)

### 9. Create Account ✅
- **Files:** [src/app/auth/signup/page.tsx](src/app/auth/signup/page.tsx), [src/app/api/auth/signup/route.ts](src/app/api/auth/signup/route.ts)

### 10. Welcome Page 🔴
- **Sheet claims:** `src/app/dashboard/welcome/page.tsx`. **Does not exist.**
- **Build spec for next agent:**
  - **Route:** Create `src/app/dashboard/welcome/page.tsx` (server component shell) + `WelcomeClient.tsx` (form).
  - **Form fields:** industry (dropdown — reuse the industry list from wherever it already lives; check [src/app/api/character-sheet/route.ts](src/app/api/character-sheet/route.ts) which accepts an `industry` param ~line 37), company name (string), optionally role/title.
  - **Persistence:** Use the existing `BrandProfile` Prisma model (id, userId, brandName, tagline, toneOfVoice, targetAudience, competitors, brandColors, guidelines). Map company → `brandName`, industry → add new `industry` column (small migration) or stash in `guidelines` JSON.
  - **API:** Either extend [src/app/api/onboarding/complete/route.ts](src/app/api/onboarding/complete/route.ts) to accept `{industry, company}` and upsert `BrandProfile`, OR add a new `POST /api/brand-profile/route.ts` — check if it already exists first (sheet row 70 claims it does).
  - **Transition:** On submit, navigate to `/dashboard/research` (or wherever the research screen will live). Post-MVP: if research isn't built yet, go straight to `/dashboard`.
  - **Guard:** Redirect to `/auth/signup` if no session; redirect to `/dashboard` if `User.onboarded` is already true.

### 11. AI Deep Research 🔴
- **Sheet claims:** `src/lib/research-agents.ts` + 4 API routes + `ResearchSession` model. **Nothing exists.** This is a net-new subsystem.
- **Build spec for next agent:**
  - **Prisma migration:** Add `ResearchSession` model — `id`, `userId`, `status` (`queued`|`running`|`ready`|`approved`|`failed`), `brandProfileId` (FK), `result` (JSON — 30-day calendar), `createdAt`, `approvedAt`. Also add `ResearchSessionDay` or keep days inside `result` JSON.
  - **Agents lib:** Create `src/lib/research-agents.ts`. Responsibilities: accept a `BrandProfile` + industry, call the LLM(s) to produce a 30-day content calendar (script, caption, suggested platform, suggested post date per day). Mirror the existing async pattern in [src/lib/character-sheet.ts](src/lib/character-sheet.ts) and [src/lib/pipeline/orchestrator.ts](src/lib/pipeline/orchestrator.ts).
  - **Routes (all under `src/app/api/research/`):**
    - `POST launch/route.ts` — creates `ResearchSession`, enqueues background job, returns `{sessionId, status: "queued"}`.
    - `GET status/route.ts?sessionId=...` — returns `{status, progress, result?}`. Client polls this (~2s) like [src/app/api/onboarding/preview-video/status/route.ts](src/app/api/onboarding/preview-video/status/route.ts).
    - `POST approve/route.ts` — marks session approved; upserts entries into the existing `Schedule` table (see [prisma/schema.prisma](prisma/schema.prisma) `Schedule` model) so the calendar page picks them up.
    - `POST regenerate-day/route.ts` — regenerates a single day's script/caption. Takes `{sessionId, dayIndex, feedback?}`.
  - **UI:** Progress screen with agent-step messaging ("Analyzing your industry...", "Drafting 30-day calendar...", etc.). On ready → navigate to step 12.
  - **⚠️ This is multiple days of work.** Flag to the user before starting.

### 12. Review Content Strategy 🟡
- **Existing:** [src/app/dashboard/calendar/page.tsx](src/app/dashboard/calendar/page.tsx) + [src/app/dashboard/calendar/CalendarClient.tsx](src/app/dashboard/calendar/CalendarClient.tsx). Used post-dashboard, not during onboarding.
- **Build spec for next agent:**
  - **Reuse not rebuild.** Extract the grid + day-card rendering from `CalendarClient` into a shared component if needed, then mount it under `/dashboard/welcome/review` (or similar) with data from the completed `ResearchSession.result`.
  - **Primary CTA:** "Approve strategy" → POST `/api/research/approve` (from step 11) → redirect to `/dashboard`.
  - **Secondary CTA:** "Edit" → step 13.

### 13. Edit Strategy 🟡
- **Existing:** Per-suggestion regenerate only, via [src/app/api/calendar/suggestions/route.ts](src/app/api/calendar/suggestions/route.ts). No bulk editor.
- **Build spec for next agent:**
  - **Route:** `/dashboard/welcome/edit` (or re-use step 12 with an `edit` mode flag).
  - **Features:** Inline edit script + caption per day; reorder days; bulk shift dates; request regenerate per day via `POST /api/research/regenerate-day`.
  - **Save:** PATCH `ResearchSession.result` JSON. On commit, run the same "approve" flow as step 12 to populate `Schedule`.

---

## Build order

Dependency- and effort-ordered:

1. **Step 5 — Pick Your Best Pose.** Small, isolated UI. Uses existing data. Good first win.
2. **Step 10 — Welcome Page.** Small. Uses existing `BrandProfile`. Unblocks 11.
3. **Step 11 — AI Deep Research.** Large, net-new. Flag scope to the user first.
4. **Step 12 — Review Content Strategy in onboarding.** Depends on 11. Mostly reuses existing calendar UI.
5. **Step 13 — Edit Strategy bulk editor.** Depends on 11.

---

## Patterns to reuse

- **Step machine:** [src/app/page.tsx](src/app/page.tsx) uses a `step` union type string. Add new steps there; don't fork a parallel state machine.
- **Background async:** [src/app/api/onboarding/voice/route.ts](src/app/api/onboarding/voice/route.ts) lines ~58–77 — persist a row with a null result, fire-and-forget the expensive work, return immediately. Client polls.
- **Status polling:** [src/app/api/onboarding/preview-video/status/route.ts](src/app/api/onboarding/preview-video/status/route.ts).
- **Onboarding completion flag:** [src/app/api/onboarding/complete/route.ts](src/app/api/onboarding/complete/route.ts) (~23 lines) flips `User.onboarded`. Reuse or extend rather than replacing.
- **Existing onboarding components** in [src/components/onboarding/](src/components/onboarding/) — keep new screens in the same folder.
- **Prisma schema** at [prisma/schema.prisma](prisma/schema.prisma). Run migrations via the project's existing tooling; check `package.json` scripts.

## Do NOT assume

- The sheet's "Codebase Reference" column tells you a file exists.
- Character sheet has 9 image URLs (it doesn't — one composite + metadata).
- `voiceId` is available synchronously (it isn't).
- Calendar generation runs during onboarding today (it doesn't).
- `src/components/onboarding/CameraCapture.tsx` is wired up (it exists but isn't used in the main flow — verify before touching).
