# Littleloop Studio

A private, single-owner studio for original animated kids' YouTube Shorts. Go from an idea to an editable storyboard, animate it, add real voice audio, export a vertical WebM, and optionally upload to your own YouTube channel.

## What works without any AI key

- Set up a private owner PIN/passphrase. Projects and sessions live in PostgreSQL; PINs are hashed.
- Make stories with eight themes and the built-in story writer.
- Animate a drawn cartoon character in every scene. Pick **bounce, walk, dance, float, or wave**, facial expressions, props, scene colors, camera moves, and entrances.
- Add your own image as a moving/panning background behind the cartoon character, or use the built-in animated world. A photo is never the *only* animated layer unless you turn the character layer off.
- Edit a multi-track timeline: reorder and duplicate clips, set 2–20-second scene durations (up to 60 seconds total), scrub playback, undo/redo, choose caption designs, and mix an original background-music preset.
- **Record your own character voices through your microphone or import existing voice clips.** Saved voice files play during preview and are mixed into the exported video.
- Export a real 540 × 960 WebM with character movement, transitions, captions, soundtrack, and any saved voice clips. Export runs in real time in a recent Chrome or Edge browser.

Browser speech synthesis can read a script during preview when a scene has no saved voice. **Browser speech synthesis is not captured in the exported video.** Record, import, or generate and save a voice clip to include speech in exports.

## Optional AI writing, backgrounds, and character voices

Set keys in the **server** environment (`.env` locally, or deployment secrets). Never use `NEXT_PUBLIC_` for these keys:

```dotenv
OPENROUTER_API_KEY=your_openrouter_key
POLLINATIONS_API_KEY=your_pollinations_key
ELEVENLABS_API_KEY=your_elevenlabs_key
```

- **OpenRouter:** uses `openrouter/free` for original storyboards and scene-motion suggestions. If it is unavailable or no key exists, the built-in story writer takes over. Free-model rate limits apply.
- **Pollinations:** can generate background-only scene images and Kokoro character voice clips. Its current image/audio catalog can require Pollen credits, even with an API key; check its current model pricing before generating. Generated pictures are backdrops; the app adds an independently moving character in front.
- **ElevenLabs:** optional lifelike, expressive character voices. The Voice tab lists the voices available to your account, generates scene clips with your chosen voice, and includes them in the export. A free plan may allow personal/non-commercial testing, but **commercial use/monetized YouTube videos require a plan with commercial rights**. Its monthly character and API limits apply.

Voice generation is optional. Your own recording/import works without provider keys or credits, subject to your rights to the audio. Do not clone or imitate someone else's voice without permission.

Arena is a model-comparison website, not a public video-generation API. This app draws and records animated cartoons locally in the browser; it does not claim to synthesize cinematic AI video for free.

## How to use the editor

1. Unlock your studio and open a project or create a new storyboard.
2. In **Motion**, set the character's action and mood, camera move, scene transition, length, background, character, and prop. Upload your own art, or optionally generate a backdrop.
3. In **Voice**, record or import a voice for a scene. Alternatively, configure an AI provider, choose a voice, and generate one or all scenes. Adjust music and voice levels. The voice player confirms what is saved.
4. In **Text**, refine the story title, captions, narration, background prompt, and caption style.
5. Use the **timeline** to scrub, drag scenes into a new order, duplicate, or undo edits. Save your changes.
6. Export a WebM and watch it. **Share** lets you review title, description, privacy, and the made-for-kids checkbox before uploading.

Keep narration short enough for each scene; the editor warns when a recorded/generated voice runs longer than a clip. Background music is synthesized by the app and does not require a stock-media license.

## Connect YouTube

1. Enable **YouTube Data API v3** in a Google Cloud project.
2. Configure the OAuth consent screen. For a testing app, add your own Google account as a test user.
3. Create an **OAuth client ID** of type **Web application**.
4. Add the exact authorized redirect URI: `https://YOUR_DOMAIN/api/youtube/callback` (for local development, `http://localhost:3000/api/youtube/callback`).
5. Set the credentials in the server environment:

```dotenv
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=https://YOUR_DOMAIN/api/youtube/callback
APP_ENCRYPTION_KEY=a_long_stable_random_secret
```

`GOOGLE_REDIRECT_URI` defaults to the current origin plus `/api/youtube/callback` if omitted. `APP_ENCRYPTION_KEY` encrypts stored refresh tokens; if omitted, the Google client secret is used. If you change either encryption key after connecting, reconnect YouTube.

6. Unlock your studio and select **Settings → Connect YouTube**.
7. In the project editor, review the finished video and publish settings, confirm it is made for kids, and click **Render & upload Short**.

Uploads are **private by default** and marked **made for kids**. Google's YouTube API quota and verification restrictions apply; unverified projects may be limited to private uploads. Nothing publishes unattended: you explicitly review and start every upload.

## Run locally

The app requires Node.js, PostgreSQL, and `DATABASE_URL` in `.env`.

```bash
npm install
npx drizzle-kit push
npm run dev
```

Create your owner PIN on the first visit. For public deployment, use HTTPS and set a strong owner passphrase before sharing the URL. The unclaimed first-run demo contains sample stories only; whoever completes the initial setup becomes the sole owner.

---

## Shorts Agent (faceless AI video) — added on top of Littleloop Studio

Open **Shorts Agent** in the sidebar. Everything above keeps working exactly as before; the agent uses new tables (`agent_*`), new routes (`/api/agent/*`) and its own media folder (`.media/agent`).

**Pipeline:** idea → story plan (hook, characters, scenes, camera/animation, SFX) → narration → AI video clip per scene → synthesized music + SFX → burned-in captions → 1080×1920 H.264/AAC MP4 → validation → **review** → (approve) → YouTube.

**Honesty rules built in**
- No video provider configured → the job fails with “Video provider not configured.” Nothing is faked.
- IMAGE MODE (stills + camera motion) is off by default. When enabled, it's clearly labelled everywhere and in the upload description.
- Factual niches (psychology, science, history, weird) require a story model. The template fallback writer only writes fiction and is labelled.
- Fiction is marked as fiction in descriptions. Uploads include an AI-content note and the synthetic-media flag.
- Music and SFX are synthesized with ffmpeg (copyright-safe). To use your own licensed tracks, put them in `AGENT_MUSIC_DIR/<mood>/`.

**Keys** (Settings → Integrations, stored server-side exactly like the existing keys; existing names are unchanged):
`POLLINATIONS_API_KEY` (video, images, Kokoro voice), `OPENROUTER_API_KEY` (story model), `ELEVENLABS_API_KEY` (voice), and optionally the paid `FAL_KEY` / `REPLICATE_API_TOKEN`.

**Server env (Vercel):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `CRON_SECRET`, optional `AGENT_STORAGE_BUCKET`.

**Optional env:** `AGENT_WORKER=off` (no background worker; jobs advance while the dashboard is open), `AGENT_MEDIA_DIR`, `AGENT_FONT_FILE`, `AGENT_MUSIC_DIR`, `FFMPEG_PATH`, `FFPROBE_PATH`.

**Hosting:** on **Vercel**, media goes to **Supabase Storage** (private bucket) and rendering runs one step per request, driven by `/api/agent/cron`. `ffmpeg` ships via the `ffmpeg-static` package and captions use the bundled `assets/fonts/DejaVuSans-Bold.ttf`. See **DEPLOY-VERCEL.md**. Without Supabase env vars, files are kept on local disk (Replit / local dev), and `.replit` lists `ffmpeg-full` for that case.

**Adding a niche:** add one object to `src/content/niches/registry.ts`.
**Adding a video provider:** implement `VideoProvider` (`src/video/providers/types.ts`) and register it in `src/video/providers/index.ts`.

Do **not** run `drizzle-kit push` against production without reviewing the diff. The agent tables are declared in `schema.ts` so push keeps them, and they are created at runtime with `CREATE TABLE IF NOT EXISTS`.
