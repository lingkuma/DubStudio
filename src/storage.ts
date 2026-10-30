import { get, set } from "idb-keyval";
import { zip, unzip, strToU8, strFromU8 } from "fflate";
import type { Project } from "./model";
const memory = new Map<string, Blob>(),
  urls = new Map<string, string>();
export async function putMedia(id: string, blob: Blob) {
  memory.set(id, blob);
  await set("media:" + id, blob);
}
export async function getMedia(id: string): Promise<Blob> {
  const b = memory.get(id) || (await get<Blob>("media:" + id));
  if (!b) throw new Error("素材丢失，请重新打开包含素材的工程包");
  memory.set(id, b);
  return b;
}
export async function mediaUrl(id: string) {
  if (!urls.has(id)) urls.set(id, URL.createObjectURL(await getMedia(id)));
  return urls.get(id)!;
}
export const saveLocal = (p: Project) => set("project", p);
export const restoreLocal = () => get<Project>("project");
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function exportProject(p: Project) {
  const files: Record<string, Uint8Array> = {
    "project.json": strToU8(JSON.stringify(p)),
  };
  for (const a of p.assets)
    files["media/" + a.id] = new Uint8Array(
      await (await getMedia(a.id)).arrayBuffer(),
    );
  const zipped = await new Promise<Uint8Array>((resolve, reject) =>
    zip(files, { level: 0 }, (e, r) => (e ? reject(e) : resolve(r))),
  );
  download(
    new Blob([zipped as BlobPart], { type: "application/zip" }),
    p.name + ".dubstudio",
  );
}
export async function importProject(file: File): Promise<Project> {
  const files = await new Promise<Record<string, Uint8Array>>(
    async (resolve, reject) => {
      try {
        unzip(new Uint8Array(await file.arrayBuffer()), (e, r) =>
          e ? reject(e) : resolve(r),
        );
      } catch (e) {
        reject(e);
      }
    },
  );
  if (!files["project.json"]) throw new Error("不是有效的 DubStudio 工程");
  const p = JSON.parse(strFromU8(files["project.json"])) as Project;
  if (
    p.version !== 1 ||
    !Array.isArray(p.assets) ||
    !Array.isArray(p.videos) ||
    !Array.isArray(p.segments)
  )
    throw new Error("工程版本或格式不受支持");
  for (const a of p.assets) {
    if (!files["media/" + a.id]) throw new Error("工程缺少素材：" + a.name);
    await putMedia(
      a.id,
      new Blob([files["media/" + a.id] as BlobPart], { type: a.mime }),
    );
  }
  p.messages ??= [];
  for (const s of p.segments)
    if (["queued", "generating"].includes(s.status)) s.status = "idle";
  return p;
}
