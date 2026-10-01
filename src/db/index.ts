import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    // Serverless: every running instance gets its own pool, and Supabase's session-mode pooler
    // allows only ~15 clients in total. Keep each pool tiny and give idle connections back fast.
    max: Math.max(1, Math.min(10, Number(process.env.DB_POOL_MAX) || (process.env.VERCEL ? 2 : 5))),
    idleTimeoutMillis: process.env.VERCEL ? 5_000 : 30_000,
    connectionTimeoutMillis: 15_000,
    allowExitOnIdle: true,
  });

// Never let a dropped pooler connection crash the function.
pool.on?.("error", (error) => console.error("postgres pool error", error.message));

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
