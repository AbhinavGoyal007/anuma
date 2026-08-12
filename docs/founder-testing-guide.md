# ANUMA founder testing guide

This guide covers the Phase 1–5 responsive-web release candidate. It is not a claim of legal recording compliance, universal language support, or background-recording support.

## Part A — start the application

### Production deployment

No ANUMA Vercel project is currently linked to this repository in the available Vercel account context. Do not use the unrelated `excenor-ai-maturity-poc` project.

To create or reconnect the correct deployment:

1. In Vercel, import `SakshamS11/anumaai`, or select the existing ANUMA project if it already exists under a different team.
2. Link its production branch to `main`.
3. Add the existing secure values to the Production environment using these names only: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SARVAM_API_KEY`, `OPENAI_API_KEY`, and `ANUMA_ANALYSIS_MODEL`. Add `SUPABASE_DB_URL` only if the deployment’s server-side acceptance tooling explicitly needs it; it is never a browser value.
4. Deploy `main`, then confirm that the production URL opens and that a new Supabase confirmation link returns to that URL.

Do not paste any credential into source code, GitHub, or a normal chat prompt.

### Local application

From the repository root, with the existing `.env.local` present:

```powershell
npm.cmd run dev
```

Open `http://localhost:3000`. Use a current Chromium-based browser. Local development is the appropriate fallback until the correct Vercel project is linked.

## Part B — Android phone test

Use Chrome on an Android phone. This is a responsive web application, not a native Android app.

1. Open ANUMA and sign in.
2. Create or select your organization and confirm the organization context is correct.
3. Create a **New interaction** and record the customer recording consent status.
4. Allow microphone access when Chrome asks.
5. Record a 1–3 minute role-play. Place the device where both customer and representative can be heard, keep the microphone uncovered, and reduce nearby audio where possible.
6. Keep ANUMA open and the screen awake during recording. Browser recording is not guaranteed to survive screen lock, Chrome suspension, or heavy backgrounding.
7. Stop recording. Confirm the elapsed time changes to an audio preview, play the preview, then choose **Save and process**.
8. If microphone access was denied, choose an existing supported audio file instead (WebM, MP4/M4A, MP3, WAV, or OGG).
9. Return after transcription completes. Confirm both speakers appear in the transcript, then map speakers explicitly. Provider speaker labels are not business roles.
10. Run interaction understanding. Inspect observations and use their evidence links; the source transcript should remain in the language actually spoken.
11. Inspect Talk balance and pace. When both people spoke, talk shares should total approximately 100%; WPM is intentionally labelled as estimated.
12. Run the interaction review. Inspect the eight Starter Electronics checks, scorecard coverage, and evidence-backed coaching.
13. Propose a correction to an observation. As a manager or admin, confirm or reject it. The original observation must remain visible; then choose **Re-evaluate review** and confirm a new review run is created rather than replacing history.

For the strongest role-play demo, naturally include a need, budget, product/spec, a competitor price comparison, an EMI/finance question, a representative response, and a next action. This is a role-play input; the resulting processed interaction is a valid replay fallback only after ANUMA has genuinely created its transcript, observations, metrics, review, and coaching.

## Part C — tablet test

Repeat the primary journey on an Android tablet in portrait and landscape. Check that:

- the organization context and navigation remain reachable;
- forms and action buttons do not require horizontal scrolling;
- transcript, mapping, metrics, review, and evidence controls remain usable;
- no important content is hidden by fixed browser or application UI.

## Part D — failure and recovery test

Perform these short checks deliberately:

1. Deny microphone permission once, then retry or upload a file.
2. Double-tap the primary record, save/process, understanding, and review actions; each should remain a single current action.
3. Refresh after starting transcription, understanding, or review; return to a clear persisted processing or failed state rather than a false success.
4. Temporarily interrupt connectivity during upload, then retry from the clear error state.
5. Briefly background Chrome during recording and again after processing starts. Recording itself may stop when Chrome is suspended; durable processing should remain understandable when you return.

## Part E — what good looks like

- No horizontal page scrolling at normal phone or tablet widths.
- Record/stop state is unambiguous, a preview is available before saving, and upload errors are understandable.
- Audio remains private and is never available to another organization.
- Speaker mapping controls who is used for later analysis and metrics.
- ANUMA does not invent an absent budget, competitor, objection, finance discussion, or next action.
- Evidence points to the supporting source segment in its original language.
- N/A and insufficient-evidence checks do not unfairly lower the scorecard denominator.
- A manual re-evaluation creates a new immutable review history.

## Part F — report an issue

For each issue, record:

- device model;
- Android version;
- Chrome version;
- page and exact steps;
- expected result;
- actual result;
- screenshot or short screen recording when useful.

Known release-candidate boundaries: physical Android validation is still required; Hindi understanding remains experimental; semantic check outcomes can vary between immutable review runs; there is no offline mode, native app, background-recording guarantee, aggregate intelligence, outcomes, or Phase 6 dashboard.
