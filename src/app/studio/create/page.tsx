import { Suspense } from "react";
import Create from "@/components/agent/Create";

export const metadata = { title: "Create — ReelForge" };

export default function CreatePage() {
  return <Suspense fallback={null}><Create /></Suspense>;
}
