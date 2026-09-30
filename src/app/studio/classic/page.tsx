import StudioApp from "@/components/studio/StudioApp";

export const dynamic = "force-dynamic";
export const metadata = { title: "Classic studio — ReelForge" };

// The original ReelForge studio, unchanged (forge one video, series, queue, providers).
export default function ClassicStudioPage() {
  return <StudioApp />;
}
