import Editor from "@/components/agent/Editor";

export const metadata = { title: "Video editor — ReelForge" };

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Editor id={id} />;
}
