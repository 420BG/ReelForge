import Publish from "@/components/agent/Publish";

export const metadata = { title: "Publish — ReelForge" };

export default async function PublishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Publish id={id} />;
}
