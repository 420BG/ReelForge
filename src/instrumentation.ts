/**
 * Next.js calls register() once when the server starts.
 * Starts the Shorts-agent background worker on the Node.js runtime only.
 * Any failure is caught so it can never stop the existing app from booting.
 * Set AGENT_WORKER=off to disable (jobs still advance while the dashboard is open).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.AGENT_WORKER === "off" || process.env.VERCEL || !process.env.DATABASE_URL) return;
    setTimeout(() => {
      import("./jobs/runner")
        .then(({ startAgentWorker }) => startAgentWorker())
        .catch((error) => console.error("[shorts-agent] worker not started:", error instanceof Error ? error.message : error));
    }, 3000);
  }
}
