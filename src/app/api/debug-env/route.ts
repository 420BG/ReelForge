export const dynamic = "force-dynamic";

function mask(v: string | undefined) {
  if (!v) return "MISSING";
  if (v.length < 12) return "***";
  return v.slice(0, 30) + "...(" + v.length + " chars)..." + v.slice(-15);
}

export async function GET() {
  return Response.json({
    DATABASE_URL: mask(process.env.DATABASE_URL),
    SUPABASE_URL: mask(process.env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: mask(process.env.SUPABASE_SERVICE_ROLE_KEY),
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV ?? "not on vercel",
  });
}
