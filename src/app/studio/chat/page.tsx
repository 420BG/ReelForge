import { Suspense } from "react";
import Chat from "@/components/agent/Chat";

export const metadata = { title: "AI Chat — ReelForge" };

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <Chat />
    </Suspense>
  );
}
