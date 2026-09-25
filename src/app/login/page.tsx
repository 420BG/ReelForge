import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, authRequired, verifySessionValue } from "@/lib/auth";
import LoginForm from "./LoginForm";
import { Logo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const requireKey = authRequired();
  const jar = await cookies();
  if (await verifySessionValue(jar.get(SESSION_COOKIE)?.value)) {
    redirect("/studio");
  }

  return (
    <main className="bg-grid relative flex min-h-screen items-center justify-center overflow-hidden px-5">
      <div className="aurora-a absolute -top-32 left-[-10%] h-[480px] w-[480px] rounded-full bg-violet/25 blur-[140px]" />
      <div className="aurora-b absolute bottom-[-20%] right-[-10%] h-[420px] w-[420px] rounded-full bg-lime/[0.07] blur-[140px]" />
      <div className="glass-deep relative w-full max-w-sm rounded-3xl p-9 text-center shadow-2xl">
        <div className="flex justify-center">
          <Logo size="lg" />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold tracking-tight">Private studio</h1>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          {requireKey
            ? "This instance is locked for a single operator. Enter the forge key to continue."
            : "Your machine is waiting. One tap gets you in — lock it from the studio anytime."}
        </p>
        <LoginForm error={params.error} requireKey={requireKey} />
      </div>
    </main>
  );
}
