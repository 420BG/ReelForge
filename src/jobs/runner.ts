import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
import { claimJob, logJob, releaseJob, updateVideo } from "@/jobs/repo";
import { runStep } from "@/jobs/video-generation/pipeline";
import { clearScratch, sweepStaleScratch } from "@/video/storage";

/**
 * Job runner. One unit of work per claim, under a DB lease, so:
 *  - two ticks (in-process timer + dashboard poll) never process the same job twice,
 *  - a server restart resumes from the last completed scene (lease expiry = recovery),
 *  - loops are bounded (MAX_TICKS per job, MAX_JOB_ERRORS unexpected errors).
 */
const OWNER = `${hostname()}-${process.pid}-${randomBytes(3).toString("hex")}`;
const SERVERLESS = Boolean(process.env.VERCEL);
/** Lease must outlive one unit of work: Vercel functions stop at ~300 s. */
const LEASE_SECONDS = SERVERLESS ? 330 : 900;
/** Long videos take a few hundred small steps (+ polling while providers work). */
const MAX_TICKS = 3000;
const MAX_JOB_ERRORS = 4;

const globalRunner = globalThis as typeof globalThis & { __agentTickBusy?: boolean; __agentWorker?: ReturnType<typeof setInterval> };

/** On Vercel each unit (a clip, a segment, the final mix) can take minutes, so one unit per request. */
export const DEFAULT_UNITS = SERVERLESS ? 1 : 3;

export async function tick(maxUnits = DEFAULT_UNITS, budgetMs = 20_000) {
  if (globalRunner.__agentTickBusy) return { ran: 0, busy: true };
  globalRunner.__agentTickBusy = true;
  const started = Date.now();
  let ran = 0;
  try {
    while (ran < maxUnits && Date.now() - started < budgetMs) {
      const claimed = await claimJob(OWNER, LEASE_SECONDS);
      if (!claimed) break;
      const { job, ticks } = claimed;
      ran++;
      if (ticks > MAX_TICKS) {
        await releaseJob(job.id, { state: "failed", error: "Safety stop: this job exceeded its step budget. Use Retry to continue." });
        await updateVideo(job.videoId, { workflow: "failed", error: "Safety stop: step budget exceeded." });
        continue;
      }
      try {
        if (SERVERLESS) await sweepStaleScratch(job.videoId);
        const outcome = await runStep(job);
        await releaseJob(job.id, {
          state: outcome.state,
          step: outcome.step,
          delaySeconds: outcome.delaySeconds ?? 0,
          progress: outcome.progress,
          currentScene: outcome.currentScene ?? null,
          error: outcome.error ?? null,
          attempts: outcome.state === "failed" ? job.attempts : 0,
        });
        if (outcome.state === "failed") {
          await updateVideo(job.videoId, { workflow: "failed", error: outcome.error ?? "Generation failed." });
          await logJob(job.id, "error", outcome.error ?? "Generation failed.");
        }
        if (SERVERLESS) await clearScratch(job.videoId); // /tmp is small and not shared between requests
        if (outcome.state === "waiting") break; // let other jobs/requests breathe while we wait on a provider
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (SERVERLESS) await clearScratch(job.videoId).catch(() => undefined);
        const attempts = job.attempts + 1;
        await logJob(job.id, "error", `Step "${job.step}" error (${attempts}/${MAX_JOB_ERRORS}): ${message}`);
        if (attempts >= MAX_JOB_ERRORS) {
          await releaseJob(job.id, { state: "failed", error: message, attempts });
          await updateVideo(job.videoId, { workflow: "failed", error: message });
        } else {
          await releaseJob(job.id, { state: "waiting", delaySeconds: Math.min(900, 30 * 2 ** attempts), error: message, attempts });
        }
      }
    }
  } finally {
    globalRunner.__agentTickBusy = false;
  }
  return { ran, busy: false };
}

/** Starts the in-process worker (Reserved VM / dev server). Safe to call more than once. */
export function startAgentWorker(intervalMs = 5000) {
  if (globalRunner.__agentWorker || SERVERLESS) return;
  globalRunner.__agentWorker = setInterval(() => { void tick(3, 25_000).catch(() => undefined); }, intervalMs);
  globalRunner.__agentWorker.unref?.();
}
