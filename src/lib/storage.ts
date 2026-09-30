import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ID = /^[0-9a-f-]{36}$/i;
const dir = () => path.join(process.cwd(), ".renders");
const file = (projectId: string) => path.join(dir(), `${projectId}.webm`);

export async function saveRender(projectId: string, bytes: Buffer) {
  if (!ID.test(projectId)) throw new Error("Invalid project id.");
  await mkdir(dir(), { recursive: true });
  await writeFile(file(projectId), bytes);
}

export async function hasRender(projectId: string) {
  if (!ID.test(projectId)) return false;
  try { await access(file(projectId)); return true; } catch { return false; }
}

export async function readRender(projectId: string): Promise<Buffer | null> {
  if (!ID.test(projectId)) return null;
  try { return await readFile(file(projectId)); } catch { return null; }
}

export async function deleteRender(projectId: string) {
  if (!ID.test(projectId)) return;
  try { await rm(file(projectId), { force: true }); } catch { /* already gone */ }
}
