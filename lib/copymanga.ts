import { createDecipheriv } from "node:crypto";
import { load } from "cheerio";
import { upstreamFetch } from "./upstream-fetch";
import type { Chapter } from "./comic-cache";

const ORIGIN = "https://mangacopy.com";
const MAX_TEXT_BYTES = 2_000_000;
const records = new Map<string, { until: number; value: string }>();
const pending = new Map<string, Promise<string>>();
const pageRecords = new Map<string, { until: number; images: string[] }>();

export class CopyMangaError extends Error {
 constructor(message: string, public status = 502) { super(message); }
}
export function copySlug(id: string) { return /^[a-z0-9_-]{1,180}$/i.test(id); }
function chapterUuid(id: string) { return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id); }
export function copyPublicImageUrl(value: string): boolean {
 try {
  const url = new URL(value);
  return value.length <= 2048 && url.protocol === "https:" && url.hostname === "sx.mangafunb.fun" && (!url.port || url.port === "443") && !url.username && !url.password && !url.search && !url.hash && /\.(?:jpe?g|png|webp|gif)$/i.test(url.pathname);
 } catch { return false; }
}
function plain(value: unknown, length = 200) { return typeof value === "string" ? value.replace(/<[^>]*>/g, "").trim().slice(0, length) : ""; }
function checkAccess(value: unknown): void {
 if (value && typeof value === "object" && ["is_lock", "is_vip", "is_login", "is_mobile_bind", "is_banned"].some(key => (value as Record<string, unknown>)[key] === true || (value as Record<string, unknown>)[key] === 1)) throw new CopyMangaError("此章节需在原站阅读", 403);
}
async function publicText(path: string): Promise<string> {
 const url = ORIGIN + path, old = records.get(url);
 if (old && old.until > Date.now()) return old.value;
 const current = pending.get(url); if (current) return current;
 const request = (async () => {
  const response = await upstreamFetch(url, { headers: { Accept: "text/html,application/json", "User-Agent": "DongdongCinema/1.0" }, redirect: "manual", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) { await response.body?.cancel(); throw new CopyMangaError([401, 402, 403, 429].includes(response.status) ? "拷贝漫画暂时限制了请求 (" + response.status + ")" : "拷贝漫画暂不可用 (" + response.status + ")", [401, 402, 403, 429].includes(response.status) ? response.status : 502); }
  const type = response.headers.get("content-type") || "";
  if (!/text\/html|application\/json/i.test(type) || Number(response.headers.get("content-length")) > MAX_TEXT_BYTES) { await response.body?.cancel(); throw new CopyMangaError("来源未返回有效数据"); }
  const reader = response.body?.getReader(); if (!reader) throw new CopyMangaError("来源未返回有效数据");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
   while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > MAX_TEXT_BYTES) { await reader.cancel(); throw new CopyMangaError("来源响应过大"); } chunks.push(part.value); }
  } finally { reader.releaseLock(); }
  const body = Buffer.concat(chunks).toString("utf8");
  if (records.size >= 120) records.delete(records.keys().next().value!);
  records.set(url, { until: Date.now() + 180_000, value: body }); return body;
 })();
 pending.set(url, request); try { return await request; } finally { pending.delete(url); }
}

// The public website supplies these page-layout values in the same HTML.
// Decode its ordinary browser payload; no app API, account or access token is used.
export function decodeCopyPublicPayload(payload: unknown, pageKey: string): unknown {
 if (typeof payload !== "string" || payload.length > MAX_TEXT_BYTES || Buffer.byteLength(pageKey) !== 16 || !/^[\x20-\x7e]{16}[a-f0-9]+$/i.test(payload) || (payload.length - 16) % 32) throw new CopyMangaError("来源数据格式已变更");
 try {
  const cipher = createDecipheriv("aes-128-cbc", Buffer.from(pageKey, "utf8"), Buffer.from(payload.slice(0, 16), "utf8"));
  const value = JSON.parse(Buffer.concat([cipher.update(Buffer.from(payload.slice(16), "hex")), cipher.final()]).toString("utf8"));
  checkAccess(value); return value;
 } catch (error) { if (error instanceof CopyMangaError) throw error; throw new CopyMangaError("来源数据格式已变更"); }
}
export function copyPageVariable(html: string, name: "ccz" | "cct" | "contentKey"): string {
 const value = html.match(new RegExp("\\bvar\\s+" + name + "\\s*=\\s*(['\"])([a-z0-9._+/=-]+)\\1\\s*;", "i"))?.[2];
 if (!value) throw new CopyMangaError(name === "contentKey" ? "拷贝漫画暂未返回可读图片，请前往原站" : "来源数据格式已变更");
 return value;
}
export function parseCopyPublicChapters(value: unknown, comic: string): Chapter[] {
 checkAccess(value);
 const data = value as { build?: { path_word?: string }; groups?: Record<string, { name?: unknown; chapters?: unknown[] }> };
 if (!data || data.build?.path_word !== comic || !data.groups || typeof data.groups !== "object" || Array.isArray(data.groups)) throw new CopyMangaError("来源数据格式已变更");
 const seen = new Set<string>(), chapters: Chapter[] = [];
 for (const group of Object.values(data.groups)) {
  if (!group || !Array.isArray(group.chapters)) throw new CopyMangaError("来源数据格式已变更");
  for (const item of group.chapters) {
   const row = item as { id?: unknown; name?: unknown; type?: unknown }, id = typeof row?.id === "string" ? row.id : "", title = plain(row?.name);
   if (!chapterUuid(id) || !title || seen.has(id)) continue;
   seen.add(id); const number = title.match(/(?:第\s*)?(\d+(?:\.\d+)?)/)?.[1] || "", isVolume = row.type === 2;
   chapters.push({ id, title, chapter: isVolume ? "" : number, volume: isVolume ? number : "", pages: 0, lang: "zh-hk", groups: plain(group.name) === "默認" ? "" : plain(group.name), externalUrl: "" });
   if (chapters.length > 10_000) throw new CopyMangaError("章节数量过多");
  }
 }
 return chapters;
}
export function parseCopyPublicPages(value: unknown): string[] {
 checkAccess(value);
 if (!Array.isArray(value) || !value.length || value.length > 2000) throw new CopyMangaError("章节暂无可读图片");
 return value.map(row => { const url = typeof row?.url === "string" ? row.url : ""; if (!copyPublicImageUrl(url)) throw new CopyMangaError("此图片服务器暂不支持"); return url; });
}
export async function copyPublicCover(comic: string): Promise<string> {
 if (!copySlug(comic)) throw new CopyMangaError("无效漫画", 400);
 const $ = load(await publicText("/comic/" + comic)), image = $(".comicParticulars-left-img img"), url = image.attr("data-src") || image.attr("src") || "";
 if (!copyPublicImageUrl(url)) throw new CopyMangaError("无效封面"); return url;
}
export async function copyPublicChapters(comic: string) {
 if (!copySlug(comic)) throw new CopyMangaError("无效漫画", 400);
 const html = await publicText("/comic/" + comic), key = copyPageVariable(html, "ccz");
 let data: { code?: number; results?: unknown }; try { data = JSON.parse(await publicText("/comicdetail/" + comic + "/chapters")); } catch (error) { if (error instanceof SyntaxError) throw new CopyMangaError("来源未返回有效数据"); throw error; }
 if (data.code !== 200) throw new CopyMangaError("拷贝漫画暂不可用 (" + data.code + ")", [401, 402, 403, 429].includes(data.code || 0) ? data.code : 502);
 const chapters = parseCopyPublicChapters(decodeCopyPublicPayload(data.results, key), comic);
 if (!chapters.length) throw new CopyMangaError("拷贝漫画暂未返回章节，请前往原站");
 return { chapters, total: chapters.length, limit: chapters.length, offset: 0 };
}
async function chapterPages(comic: string, chapter: string): Promise<string[]> {
 if (!copySlug(comic) || !chapterUuid(chapter)) throw new CopyMangaError("无效章节", 400);
 const key = comic + ":" + chapter, old = pageRecords.get(key); if (old && old.until > Date.now()) return old.images;
 const html = await publicText("/comic/" + comic + "/chapter/" + chapter);
 const images = parseCopyPublicPages(decodeCopyPublicPayload(copyPageVariable(html, "contentKey"), copyPageVariable(html, "cct")));
 if (pageRecords.size >= 120) pageRecords.delete(pageRecords.keys().next().value!);
 pageRecords.set(key, { until: Date.now() + 180_000, images }); return images;
}
export async function copyPublicPages(comic: string, chapter: string): Promise<string[]> {
 const images = await chapterPages(comic, chapter);
 return images.map((_, page) => "/api/manga?" + new URLSearchParams({ provider: "mangacopy", op: "image", comic, id: chapter, page: String(page) }));
}
export async function copyPublicPageImage(comic: string, chapter: string, page: number): Promise<string> {
 if (!Number.isInteger(page) || page < 0 || page >= 2000) throw new CopyMangaError("无效页码", 400);
 const images = await chapterPages(comic, chapter); if (page >= images.length) throw new CopyMangaError("无效页码", 400); return images[page];
}
