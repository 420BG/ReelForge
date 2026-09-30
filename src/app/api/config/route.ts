import { isAuthenticated } from "@/lib/auth";
import { getStudioConfig } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio." }, { status: 401 });
  return Response.json({ config: await getStudioConfig() });
}
