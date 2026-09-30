import type { ReactNode } from "react";
import { StudioProvider } from "@/components/studio/StudioContext";

// The autopilot page reads shared studio state via useStudio(), so it must render inside the provider.
export default function AutopilotLayout({ children }: { children: ReactNode }) {
  return <StudioProvider>{children}</StudioProvider>;
}
