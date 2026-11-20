# Slide Narrator

Upload a PowerPoint. An AI presenter explains your slides live, you can interrupt it by voice or text, and you download the result as an MP4 with captions. The presenter is an [Agora Conversational AI Engine](https://docs.agora.io/en/ai/overview) agent that speaks over Agora's real-time network, so the voice is produced and delivered live rather than rendered offline.

Your actual slides are the background of the video. The presenter appears in a corner as an animated circle that glows with the voice, or as **your own picture**. It does not lip-sync (see [What does not work](#what-does-not-work)).

> Status: a working recipe, tested end to end in Chrome with the sample deck. Read [What does not work](#what-does-not-work) before you rely on it.

## How it works

```
 .pptx ─► the browser reads the slides and draws each one as a picture       (nothing is uploaded)
        │   (a PDF export can be added for sharper pictures)
        ▼
 script ─► /api/narrate ─► Gemini drafts ~40 words per slide                (slide text is sent; you agree first)
        │   editable on the Edit page
        ▼
 Start  ─► an Agora agent joins a channel; the browser joins as a participant
        │   (RTC for audio, RTM for the agent's speaking / silent signals; the microphone is opened)
        ▼
 live talk ─► for each slide the presenter is cued with your talking points and says them in its own words;
        │     if you speak or type, it stops, answers, then finishes the slide before moving on
        ▼
 recording ─► canvas (slide + presenter) + the agent's audio ─► MediaRecorder ─► MP4 in your tab
```

What Agora does: runs the agent (listening, thinking, voice), carries the audio in real time over RTC, handles interruptions, and reports when the agent starts and stops talking over RTM (Signaling). Those signals are how a slide knows when it is finished and when someone has broken in. Your browser draws and records the picture.

Nothing is stored on a server. Slides, pictures and the finished video live in the tab and disappear when it closes.

## What you need

- Node 22 or newer and [pnpm](https://pnpm.io).
- An [Agora](https://console.agora.io) project with the **App Certificate** enabled and these services switched on under RTC Services: **Conversational AI Engine** and **Signaling** (RTM). Chat is not needed.
- A [Google AI Studio](https://aistudio.google.com) API key for Gemini (free tier works).
- A recent Chrome or Edge to record an MP4 (verified in Chrome only). Safari is untested; Firefox cannot write MP4.

No speech-to-text, language-model or voice keys are needed for the agent: the recipe uses Agora's managed presets.

## Run it

```bash
pnpm install
cp .env.example .env
```

Fill in `.env`, at least:

| Variable | What it is |
|---|---|
| `AGORA_APP_ID`, `NEXT_PUBLIC_AGORA_APP_ID` | Your project's App ID. The same value twice: the second one is the copy the browser is allowed to see. Not secret. |
| `AGORA_APP_CERTIFICATE` | Secret. Used on the server to create tokens. Never paste it into chat or commit it. |
| `GOOGLE_API_KEY` | Gemini key for writing the narration. |
| `AGORA_REGION` | Optional. `ASIA`, `NORTH_AMERICA`, `EUROPE`, `INDIA`, `JAPAN` or `GLOBAL`. Pins where the agent runs. |
| `APP_ACCESS_CODE` | Optional locally, **required when deployed**. See [Deploy](#deploy-to-vercel). |

Then:

```bash
pnpm dev
```

Open http://localhost:3000, click **Load sample deck** to try it, or upload your own `.pptx` and a PDF export of it.

## Use it

1. **Upload.** Tick the box (slide text and pictures go to Agora's AI agent and to Google Gemini; on Gemini's free tier Google may use them to improve its products, so do not use a confidential deck), then choose your `.pptx`. The slides are drawn in your browser (about 3 to 16 seconds for decks of 11 to 42 slides), the script is drafted, and you land on the presenter. To get exact pictures, select a PDF export of the deck together with the `.pptx` (or a PDF alone).
2. **Present.** Click **Start presenting**. The presenter connects (if Agora drops the first agent the page replaces it), the microphone opens, recording starts, and the talk begins. Speak or type a question at any time: the presenter stops, answers, then finishes its slide. Use headphones, or it can hear itself.
3. **Download.** **Stop and save** ends the talk early; when it ends either way, the video replaces the stage with **Download video** and **Captions** right there. **Present again** runs it again.

Other pages, each behind a button: **Edit script** (one box per slide, skip slides, rewrite with AI), **Settings** (presenter shape, corner, size, your own picture, "improvise from my script" or "read it exactly", recording and microphone on or off), **Details** (session, per-slide timings and agent events). The script is limited to about 2:30 for recording, with a warning from 2:00.

## Costs

- **Agora Conversational AI Engine:** [$0.10 per minute](https://docs.agora.io/en/ai/reference/pricing) of agent time, first 300 minutes free, as listed on Agora's pricing page when this was written. The agent runs while the session is open, including time before and after recording. Whether agents that fail at start are billed has not been checked.
- **Gemini:** free tier; paid usage is billed by Google.
- **Recording:** free, done in your browser. There is no storage bucket.

Stop the session when you are done: the page stops the agent when you leave it, and an idle agent leaves on its own after about two minutes, but do not rely on that.

## What does not work

Honest list, from testing in November 2026. Details and evidence are in [docs/feasibility.md](docs/feasibility.md).

- **No lip-synced avatar.** Agora's avatar integrations (Anam, HeyGen LiveAvatar) did not work in our tests: with Anam the avatar never appeared in the channel, with LiveAvatar Agora rejected the start (HTTP 400 `ErrInternal`). Both are Beta at Agora, and their errors are not documented. The adapters are in the code but hidden unless you set `AVATAR_PROVIDER=anam` or `heygen`. Treat them as experimental.
- **Agora agents sometimes fail to join.** Roughly 1 in 6 to 3 in 10 agent starts ended with "RTC connection error" a few seconds after starting. The app watches each new agent for five seconds and replaces failures (up to six tries), so you usually only see a longer "starting" time. The cause is not known.
- **The tab must stay in front while recording.** A background tab stops drawing frames. The result warns you if that happened.
- **Browsers.** MP4 recording was verified in Chrome 156 only. Safari and Firefox are untested.
- **Captions are separate files**, not burned into the picture. Their words are what the presenter actually said and each slide's start and end are measured; the timing between sentences inside a slide is estimated.
- **Slide pictures drawn from the PowerPoint are good but not perfect.** On four real decks (11 to 42 slides) layouts, pictures, tables and logos came through; one dark-themed deck lost a few full-slide background images. A PDF export is exact.
- **A real user picture was not recorded live;** the drawing is unit-tested and the picture preview was checked on screen.
- **Spoken questions and voice interruptions were not tested.** Typed ones were, live: a question typed in the middle of a slide made the presenter stop, answer, finish the slide and carry on; it also declined an off-topic question and refused an \"ignore your rules\" attempt. The microphone path publishes your voice to the agent, but the test browser blocks microphone access, so a real spoken interruption has not been tried. Use headphones: without them the presenter can hear itself and interrupt itself.
- **"Improvise" puts your talking points into the presenter's own words.** It can drift from your wording or add a connecting phrase; choose **Read it exactly** in Settings to speak your text verbatim. Either way it is told not to invent facts that are not in the deck, but that is an instruction to a model, not a guarantee.
- **Q&A answers come from Agora's managed language model** (a small, fast one) given your slide text and narration, capped at about 7,000 characters. Long decks lose their last slides from its context, and answers can still be wrong. The presenter learns the deck when its session starts; if you edit the script, the next **Start presenting** begins a fresh session so it knows the new text.
- **Gemini's free tier was flaky** during testing: two of three narration requests failed before one succeeded. Click **Write narration** again.
- **Cloud Recording is not built.** Everything is recorded locally.
- **Long decks.** Each slide gets about 250 words in total divided across the deck; a 24-slide deck gets roughly 10 words per slide.

## Deploy to Vercel

1. Push the folder to a Git repository and import it in Vercel, or run `npx vercel`.
2. Under **Project Settings → Environment Variables**, add the names from `.env.example`: at least `AGORA_APP_ID`, `NEXT_PUBLIC_AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `GOOGLE_API_KEY` and **`APP_ACCESS_CODE`**. Add them for Production and Preview, then redeploy: Vercel applies variable changes only to new deployments.
3. Share the access code only with people you trust. Every route that spends money (start, speak, status, stop, narrate) rejects requests without it, and **a production build with no `APP_ACCESS_CODE` refuses all requests**, so a forgotten setting cannot leave your Agora minutes open to anyone with the link. The code is kept in the visitor's tab session only.

The routes are short (the longest, starting an agent, is capped at 60 s, well under the Hobby limit). Parsing, PDF rendering, compositing and recording all happen in the browser, so no heavy work runs on Vercel.

## Safety and privacy

- The App Certificate and every key stay on the server; the browser only gets the App ID and short-lived tokens for its own user.
- Slide text is treated as material to explain, never as instructions to the model.
- Your picture and slides never leave the tab, except: slide text, titles and your script go to Agora's AI agent (it needs them to present and answer), and slide text plus small slide images go to Gemini to draft the script. You agree to both before uploading.
- Do not use a picture of someone who has not agreed, or of a public figure.

## Development

```bash
pnpm test         # unit tests (no network, no keys)
pnpm typecheck
pnpm build        # or NEXT_DIST_DIR=.next-build pnpm build to build beside a running dev server
pnpm samples      # regenerate the sample deck and PDF in public/samples
```

Layout:

```
app/api/…            narrate, session (start, speak, status, stop), access, health
components/          Studio, IngestPanel, NarrationPanel, StagePanel, Stage, Orb, AccessGate
lib/ingest/          .pptx parsing, PDF rendering and text, slide/page matching
lib/narration/       prompt, Gemini call, timing and word budgets, 512-byte /speak chunking
lib/qa/              the deck context the agent answers from, and chat-line mapping for the transcript
lib/agora/           presenter choice, agent start/stop/speak (server only)
lib/stage/           session hook, slide driver, start-retry, frame composer, recorder, captions, sanity checks
docs/feasibility.md  what was tested, what failed, and the evidence
```

## Troubleshooting

| You see | Try |
|---|---|
| "Presenter did not connect, trying again" | Normal. Agora dropped an agent; the page starts another. |
| "The presenter agent could not connect after 6 tries" | Wait a minute and retry. If it persists, check the Agora Console and ask Agora support. |
| "Missing Agora setting: …" | Fill in the named variable in `.env` and restart `pnpm dev`. |
| "Wrong or missing access code" | Enter the code set as `APP_ACCESS_CODE`. |
| "This deployment has no APP_ACCESS_CODE" | Set `APP_ACCESS_CODE` in Vercel and redeploy. |
| No voice heard / silent video | Click in the page first (browsers block sound until you interact), and check the tab is not muted. |
| Video says it was in the background | Record again and keep the tab visible. |
| Narration fails | Click **Write narration** again; Gemini's free tier fails intermittently. Check `GOOGLE_API_KEY` if it keeps failing. |
| "The browser blocked the microphone" | Allow the microphone for this site in the browser, or type your questions instead. |
| The presenter says something that is not in my script | It is improvising. Choose **Read it exactly** in Settings. |
