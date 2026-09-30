import type { ReactNode } from "react";
import { StudioProvider } from "@/components/studio/StudioContext";
import AgentShell from "@/components/agent/Shell";

export const dynamic = "force-dynamic";

// One provider + app frame for every /studio page (sidebar on desktop, bottom nav on mobile).
export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <StudioProvider>
      <AgentShell>{children}</AgentShell>
    </StudioProvider>
  );
}
