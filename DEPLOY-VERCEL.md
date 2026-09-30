# Updating the live app (Replit → GitHub → Vercel, Supabase)

The upgrade is additive. Existing routes, env variables, keys and tables are unchanged.
New pieces: `/api/agent/*` routes, `agent_*` tables (created automatically), and a private
Supabase Storage bucket `agent-media` (created automatically on first use).

## 1. Update the code in Replit (on a branch)

```bash
git checkout -b feature/shorts-agent
# copy the upgraded files over your project (keep your .git folder and .env / secrets)
npm install            # IMPORTANT: updates package-lock.json with ffmpeg-static
npm run typecheck
npm run build
git status             # expect ~11 modified files + new folders (src/content, src/jobs, src/video, src/app/api/agent, assets/fonts)
git add -A
git commit -m "Add Shorts Agent (Vercel + Supabase)"
git push -u origin feature/shorts-agent
```

Make sure `.gitignore` contains:
```
node_modules
.next
.env*
.media
.renders
```
You must commit `package-lock.json` too. Vercel installs from the lockfile, so without it the build fails.

## 2. Vercel settings (Project → Settings)

**Environment Variables.** Add these for Production and Preview. Don't change any existing ones.

| Name | Value | Notes |
|---|---|---|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | the **service_role** secret key | Server-only. Never add a `NEXT_PUBLIC_` prefix |
| `CRON_SECRET` | a long random string (e.g. `openssl rand -hex 32`) | Used by the scheduler |
| `AGENT_STORAGE_BUCKET` | `agent-media` | Optional |

**Functions.** Make sure **Fluid Compute** is enabled so agent routes may run up to 300 s.
The heaviest step (the final mix of a 60 s video) took about 2 minutes on one CPU core in testing.

Env changes only apply to new deployments, so redeploy after adding them.

## 3. Test the Preview deployment

Pushing the branch creates a Preview URL. On it:
1. Log in and check that the old features still work: projects, editor, WebM export, Settings.
2. Open **Shorts Agent**. The status strip should show **Renderer ready**.
3. Create a 15 s **draft** and keep the dashboard open while it runs. The open dashboard advances the job even without the cron.

Note: if Preview uses the same `DATABASE_URL`, the new tables are created in your production database. That's safe because it only adds tables.
YouTube login won't work on the Preview URL unless you add that redirect URI in Google Cloud. Test publishing on production.

## 4. Go live

Open a Pull Request `feature/shorts-agent → main` and merge it. Vercel deploys production.
**Rollback:** Vercel → Deployments → previous deployment → **Promote to Production**. It's instant, and the database needs nothing because nothing was dropped.

## 5. Scheduler (so jobs run while the dashboard is closed)

Vercel Hobby cron only runs once a day, so use a free external scheduler:

**cron-job.org:** create a job with
- URL: `https://<your-domain>/api/agent/cron`
- Schedule: every 1 minute
- Advanced → Headers: `Authorization: Bearer <CRON_SECRET>`

Each call does one unit of work: one clip, one scene render, or the final mix. Database leases prevent double work.
On Vercel Pro you can use Vercel Cron instead. It sends the same header automatically when `CRON_SECRET` is set.

## 6. Limits to know

- **Supabase free plan:** 50 MB per file. Final MP4s are capped at about 38 MB for 60 s (≈15 MB for 30 s). Storage quota is 1 GB, so delete old videos from **My videos** (this removes their files too).
- **Pollinations video** usually needs Pollen credits. Without them, jobs fail with a clear error, or you can enable IMAGE MODE in Agent settings (always labelled).
- The old daily Autopilot (`/api/autopilot`) is unchanged.
