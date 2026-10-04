import type { Work } from "@/lib/media";

export type Chapter = { id: string; chapter: string; volume: string; title: string; pages: number; lang: string; groups: string; externalUrl: string };
export type CachedChapter = { id: string; work: Work; chapter: Chapter; sourceKey: string; lang: string; images: string[]; cachedPages: number; complete: boolean; bytes: number; updatedAt: number; lastPage: number; cachedIndexes: number[] };
type SavedPage = { key: string; chapterId: string; index: number; blob: Blob };
const DB_NAME = "dongdong-comic-cache", CACHE_EVENT = "dongdong-comic-cache";
let database: Promise<IDBDatabase> | undefined;
export function cachedChapterId(sourceKey: string, chapterId: string, lang: string) { return sourceKey + "|" + chapterId + "|" + lang; }
function changed() { if (typeof window !== "undefined") window.dispatchEvent(new Event(CACHE_EVENT)); }
function abortableTransaction(tx: IDBTransaction, signal?: AbortSignal) {
 const stop = () => { try { tx.abort(); } catch { /* The transaction already committed. */ } };
 if (signal?.aborted) stop(); else signal?.addEventListener("abort", stop, { once: true });
 const cleanup = () => signal?.removeEventListener("abort", stop);
 tx.addEventListener("complete", cleanup, { once: true }); tx.addEventListener("abort", cleanup, { once: true });
}
function transactionError(tx: IDBTransaction, signal?: AbortSignal) { return signal?.aborted ? new DOMException("已取消", "AbortError") : storageError(tx.error); }
function storageError(error: unknown): Error { return new Error((error as DOMException)?.name === "QuotaExceededError" ? "本地空间不足，请清理缓存" : error instanceof Error ? error.message : "本地缓存不可用"); }
function openDatabase(): Promise<IDBDatabase> {
 if (typeof indexedDB === "undefined") return Promise.reject(new Error("当前浏览器不支持本地缓存"));
 if (!database) database = new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => { const db = request.result; db.createObjectStore("chapters", { keyPath: "id" }); db.createObjectStore("pages", { keyPath: "key" }).createIndex("chapterId", "chapterId"); };
  request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); database = undefined; }; resolve(db); };
  request.onerror = () => { database = undefined; reject(storageError(request.error)); };
  request.onblocked = () => { database = undefined; reject(new Error("请关闭其他页面后重试缓存")); };
 });
 return database;
}
async function readStore<T>(store: string, key?: string): Promise<T> {
 const db = await openDatabase();
 return new Promise((resolve, reject) => { const tx = db.transaction(store, "readonly"), request = key === undefined ? tx.objectStore(store).getAll() : tx.objectStore(store).get(key); request.onsuccess = () => resolve(request.result as T); request.onerror = () => reject(storageError(request.error)); tx.onabort = () => reject(storageError(tx.error)); });
}
export async function listCachedChapters(): Promise<CachedChapter[]> { return (await readStore<CachedChapter[]>("chapters")).sort((a, b) => b.updatedAt - a.updatedAt); }
export async function getCachedChapter(id: string): Promise<CachedChapter | null> { return (await readStore<CachedChapter | undefined>("chapters", id)) || null; }
export async function getCachedPage(chapterId: string, page: number): Promise<Blob | null> { return (await readStore<SavedPage | undefined>("pages", chapterId + "|" + page))?.blob || null; }
export async function prepareCachedChapter(input: Omit<CachedChapter, "cachedPages" | "complete" | "bytes" | "updatedAt" | "lastPage" | "cachedIndexes">, signal?: AbortSignal): Promise<CachedChapter> {
 checkAbort(signal); const db = await openDatabase(); checkAbort(signal);
 const record = await new Promise<CachedChapter>((resolve, reject) => {
  const tx = db.transaction(["chapters", "pages"], "readwrite"), store = tx.objectStore("chapters"), pages = tx.objectStore("pages"), request = store.get(input.id); let result: CachedChapter;
  abortableTransaction(tx, signal);
  request.onsuccess = () => {
   const previous = request.result as CachedChapter | undefined, cachedIndexes = (previous?.cachedIndexes || []).filter(index => input.images[index] !== undefined && previous!.images[index] === input.images[index]);
   const removed = (previous?.cachedIndexes || []).filter(index => !cachedIndexes.includes(index)); let bytes = previous?.bytes || 0, remaining = removed.length;
   const finish = () => { result = { ...input, cachedIndexes, cachedPages: cachedIndexes.length, complete: input.images.length > 0 && cachedIndexes.length === input.images.length, bytes: Math.max(0, bytes), updatedAt: Date.now(), lastPage: Math.max(0, Math.min(input.images.length - 1, previous?.lastPage || 0)) }; store.put(result); };
   if (!remaining) finish();
   for (const index of removed) { const key = input.id + "|" + index, old = pages.get(key); old.onsuccess = () => { bytes -= (old.result as SavedPage | undefined)?.blob.size || 0; pages.delete(key); if (!--remaining) finish(); }; }
  };
  tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(transactionError(tx, signal));
 }); changed(); return record;
}
export async function saveCachedPage(chapterId: string, page: number, blob: Blob, signal?: AbortSignal): Promise<CachedChapter> {
 checkAbort(signal); const db = await openDatabase(); checkAbort(signal);
 const record = await new Promise<CachedChapter>((resolve, reject) => {
  const tx = db.transaction(["chapters", "pages"], "readwrite"), chapters = tx.objectStore("chapters"), pages = tx.objectStore("pages"), get = chapters.get(chapterId); let result: CachedChapter;
  abortableTransaction(tx, signal);
  get.onsuccess = () => {
   const existing = get.result as CachedChapter | undefined;
   if (!existing || page < 0 || page >= existing.images.length) { tx.abort(); reject(new Error("缓存已移除")); return; }
   const key = chapterId + "|" + page, old = pages.get(key);
   old.onsuccess = () => { const cachedIndexes = [...new Set([...existing.cachedIndexes, page])].sort((a, b) => a - b); result = { ...existing, cachedIndexes, cachedPages: cachedIndexes.length, complete: existing.images.length > 0 && cachedIndexes.length === existing.images.length, bytes: existing.bytes - ((old.result as SavedPage | undefined)?.blob.size || 0) + blob.size, updatedAt: Date.now() }; pages.put({ key, chapterId, index: page, blob } satisfies SavedPage); chapters.put(result); };
  };
  tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(transactionError(tx, signal));
 }); changed(); return record;
}
export async function setCachedReadingPage(id: string, page: number): Promise<void> {
 const db = await openDatabase(); await new Promise<void>((resolve, reject) => { const tx = db.transaction("chapters", "readwrite"), store = tx.objectStore("chapters"), request = store.get(id); request.onsuccess = () => { const record = request.result as CachedChapter | undefined; if (record) store.put({ ...record, lastPage: Math.max(0, Math.min(record.images.length - 1, page)) }); }; tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(storageError(tx.error)); });
}
export async function deleteCachedChapters(ids: string[]): Promise<void> {
 const unique = [...new Set(ids)]; if (!unique.length) return;
 const db = await openDatabase(); await new Promise<void>((resolve, reject) => {
  const tx = db.transaction(["chapters", "pages"], "readwrite"), chapters = tx.objectStore("chapters"), pages = tx.objectStore("pages").index("chapterId");
  for (const id of unique) { chapters.delete(id); const cursor = pages.openCursor(IDBKeyRange.only(id)); cursor.onsuccess = () => { const item = cursor.result; if (item) { item.delete(); item.continue(); } }; }
  tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(storageError(tx.error));
 }); changed();
}
export async function deleteCachedChapter(id: string): Promise<void> { return deleteCachedChapters([id]); }
export async function clearCachedChapters(): Promise<void> { const db = await openDatabase(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(["chapters", "pages"], "readwrite"); tx.objectStore("chapters").clear(); tx.objectStore("pages").clear(); tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(storageError(tx.error)); }); changed(); }

class ComicImageError extends Error { constructor(message: string, public restricted = false) { super(message); } }
function restriction(status: number): boolean { return [401, 402, 403, 429].includes(status); }
function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw new DOMException("已取消", "AbortError"); }
function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
 if (!signal) return promise; checkAbort(signal);
 return new Promise((resolve, reject) => { const stop = () => reject(new DOMException("已取消", "AbortError")); signal.addEventListener("abort", stop, { once: true }); promise.then(value => { signal.removeEventListener("abort", stop); if (signal.aborted) stop(); else resolve(value); }, error => { signal.removeEventListener("abort", stop); reject(error); }); });
}
async function imageBlob(response: Response): Promise<Blob> {
 if (!response.ok) {
  const message = await response.text().catch(() => "");
  const limited = restriction(response.status) || /(?:quota|额度|限额|\b(?:401|402|403|429)\b)/i.test(message);
  throw new ComicImageError(limited ? "来源限制了图片请求" : "图片暂不可用", limited);
 }
 if (Number(response.headers.get("content-length")) > 16_000_000) throw new ComicImageError("图片过大");
 const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.length > 16_000_000) throw new ComicImageError("图片过大");
 const type = bytes[0] === 255 && bytes[1] === 216 ? "image/jpeg" : bytes[0] === 137 && bytes[1] === 80 ? "image/png" : String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" ? "image/webp" : bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70 ? "image/gif" : "";
 if (!type) throw new ComicImageError("未收到有效图片"); return new Blob([bytes], { type });
}
async function fetchImage(src: string, provider: string, signal: AbortSignal): Promise<Blob> {
 if (provider !== "komiic") return imageBlob(await fetch(src, { signal, credentials: "omit" }));
 const kid = src.match(/^https:\/\/komiic\.com\/api\/image\/([a-f0-9-]{36})$/i)?.[1]; if (!kid) throw new ComicImageError("无效图片");
 const response = await fetch("https://komiic.com/api/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operationName: "getImageTicket", query: "query getImageTicket($kid: String!) { getImageTicket(kid: $kid) { url ticket kid } }", variables: { kid } }), signal, credentials: "omit" });
 if (response.status === 402) throw new ComicImageError("Komiic 今日图片额度已用完", true);
 if (restriction(response.status)) throw new ComicImageError("Komiic 暂时限制了图片请求", true);
 const data = await response.json().catch(() => null);
 if (data?.errors?.some((e: { extensions?: { code?: string }; message?: string }) => e.extensions?.code === "QUOTA_EXCEEDED" || /quota|额度/i.test(e.message || ""))) throw new ComicImageError("Komiic 今日图片额度已用完", true);
 if (data?.errors?.some((e: { extensions?: { code?: string }; message?: string }) => /RATE_LIMIT|FORBIDDEN|UNAUTH|limit|限制/i.test((e.extensions?.code || "") + " " + (e.message || "")))) throw new ComicImageError("Komiic 暂时限制了图片请求", true);
 const ticket = data?.data?.getImageTicket; if (!response.ok || !ticket) throw new ComicImageError("Komiic 图片暂不可用");
 const url = new URL(ticket.url); if (url.protocol !== "https:" || url.hostname !== "img.komiic.com" || url.username || url.password) throw new ComicImageError("无效图片");
 const imageResponse = await fetch(url, { headers: { "X-Image-Ticket": ticket.ticket }, signal, credentials: "omit", redirect: "error" });
 if (imageResponse.status === 402) throw new ComicImageError("Komiic 今日图片额度已用完", true); return imageBlob(imageResponse);
}
/** One reader shares in-flight requests; blobs are bounded and object URLs belong to the visible image. */
export class ComicPageCache {
 private memory = new Map<string, Blob>(); private pending = new Map<string, { promise: Promise<Blob>; controller: AbortController; consumers: number; settled: boolean }>(); private blocked = new Map<string, Error>(); private controllers = new Set<AbortController>(); private bytes = 0; private disposed = false;
 constructor(private maxBytes = 64_000_000, private maxPages = 12) {}
 async get(src: string, provider: string, options: { chapterId?: string; page?: number; signal?: AbortSignal } = {}): Promise<Blob> {
  checkAbort(options.signal); if (this.disposed) throw new DOMException("已取消", "AbortError"); const key = provider + "|" + src, cached = this.memory.get(key);
  if (cached) { this.memory.delete(key); this.memory.set(key, cached); return cached; }
  // Join before IndexedDB's asynchronous read, so a page flip can take over its prefetch.
  const running = this.pending.get(key); if (running) return this.consume(key, running, options.signal);
  if (options.chapterId !== undefined && options.page !== undefined) {
   const local = await getCachedPage(options.chapterId, options.page).catch(() => null); checkAbort(options.signal);
   if (this.disposed) throw new DOMException("已取消", "AbortError");
   if (local) { this.remember(key, local); return local; }
  }
  const available = this.memory.get(key); if (available) { this.memory.delete(key); this.memory.set(key, available); return available; }
  if (this.blocked.has(provider)) throw this.blocked.get(provider)!;
  let request = this.pending.get(key);
  if (!request) {
   const controller = new AbortController(); this.controllers.add(controller);
   request = { promise: Promise.resolve(new Blob()), controller, consumers: 0, settled: false }; const entry = request;
   entry.promise = fetchImage(src, provider, AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)])).then(blob => { if (!this.disposed && !controller.signal.aborted) this.remember(key, blob); return blob; }).catch(error => { if (error instanceof ComicImageError && error.restricted) this.blocked.set(provider, error); throw error; }).finally(() => { entry.settled = true; if (this.pending.get(key) === entry) this.pending.delete(key); this.controllers.delete(controller); });
   this.pending.set(key, request);
  }
  return this.consume(key, request, options.signal);
 }
 private async consume(key: string, request: { promise: Promise<Blob>; controller: AbortController; consumers: number; settled: boolean }, signal?: AbortSignal): Promise<Blob> { request.consumers++; try { return await waitFor(request.promise, signal); } finally { request.consumers--; if (!request.settled && !request.consumers) { request.controller.abort(); if (this.pending.get(key) === request) this.pending.delete(key); } } }
 private remember(key: string, blob: Blob) { const old = this.memory.get(key); if (old) { this.bytes -= old.size; this.memory.delete(key); } while (this.memory.size && (this.memory.size >= this.maxPages || this.bytes + blob.size > this.maxBytes)) { const oldest = this.memory.keys().next().value!; this.bytes -= this.memory.get(oldest)!.size; this.memory.delete(oldest); } if (blob.size <= this.maxBytes) { this.memory.set(key, blob); this.bytes += blob.size; } }
 dispose() { this.disposed = true; for (const controller of this.controllers) controller.abort(); this.controllers.clear(); this.memory.clear(); this.bytes = 0; }
}
