"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Maximize, ExternalLink, ChevronLeft, ChevronRight, Layers3, Check, Download, X, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mangaSources, type Work } from "@/lib/media";
import { ComicPageCache, cachedChapterId, getCachedChapter, listCachedChapters, prepareCachedChapter, saveCachedPage, setCachedReadingPage, deleteCachedChapter, deleteCachedChapters, type Chapter, type CachedChapter } from "@/lib/comic-cache";
import { cacheChaptersSequential, collectAllChapters, mergeChapters, nextChapterPage, type ChapterPage, type ComicBatchProgress } from "@/lib/comic-batch";
import { prepareOfflineShell } from "@/lib/offline-shell";
import ComicPageImage from "@/components/comic-page-image";

export default function MangaReader({ work, initialCachedChapterId }: { work: Work; initialCachedChapterId?: string }) {
 const sources = useMemo(() => mangaSources(work), [work]);
 const [sourceKey, setSourceKey] = useState(() => { const s = sources.find(s => s.mode === "inline") || sources[0]; return s ? s.provider + ":" + s.id : ""; }), [sourceOpen, setSourceOpen] = useState(false);
 const source = sources.find(s => s.provider + ":" + s.id === sourceKey) || sources[0];
 const [chapters, setChapters] = useState<Chapter[]>([]), [lang, setLang] = useState("zh"), [total, setTotal] = useState(0), [chapter, setChapter] = useState<Chapter | null>(null), [images, setImages] = useState<string[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState(""), [offset, setOffset] = useState(0), [page, setPage] = useState(0), [fullscreen, setFullscreen] = useState(false);
 const [localChapterId, setLocalChapterId] = useState(initialCachedChapterId || ""), [cacheRecord, setCacheRecord] = useState<CachedChapter | null>(null), [caching, setCaching] = useState(false), [cacheMessage, setCacheMessage] = useState(""), [loadedPage, setLoadedPage] = useState<{ id: string; page: number } | null>(null);
 const [selecting, setSelecting] = useState(false), [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set()), [selectingAll, setSelectingAll] = useState(false), [deleting, setDeleting] = useState(false), [cachedRecords, setCachedRecords] = useState<Map<string, CachedChapter>>(() => new Map()), [batchProgress, setBatchProgress] = useState<ComicBatchProgress | null>(null);
 const reader = useRef<HTMLDivElement>(null), readNumber = useRef(0), pending = useRef<AbortController | null>(null), download = useRef<AbortController | null>(null), alive = useRef(false), [imageCache] = useState(() => new ComicPageCache());
 const allPending = useRef<AbortController | null>(null), contextNumber = useRef(0), progressRef = useRef<ComicBatchProgress | null>(null), currentCacheId = useRef(""), downloadMode = useRef<"single" | "batch" | null>(null);
 const chapterCacheId = chapter ? (localChapterId || cachedChapterId(sourceKey, chapter.id, lang)) : "";
 currentCacheId.current = chapterCacheId;
 const selectedChapters = chapters.filter(c => selectedIds.has(c.id) && !c.externalUrl), selectedCacheIds = selectedChapters.map(c => cachedChapterId(sourceKey, c.id, lang)).filter(id => cachedRecords.has(id));
 function cancelDownload(showMessage = false) { download.current?.abort(); download.current = null; downloadMode.current = null; setCaching(false); if (showMessage) { const p = progressRef.current; setCacheMessage(p ? "已暂停 · " + p.completed + "/" + p.total + " 章" : "已暂停"); } }
 function cancelSelectAll() { allPending.current?.abort(); allPending.current = null; setSelectingAll(false); }
 useEffect(() => { alive.current = true; return () => { alive.current = false; download.current?.abort(); pending.current?.abort(); allPending.current?.abort(); queueMicrotask(() => { if (!alive.current) imageCache.dispose(); }); }; }, [imageCache]);
 function endpoint(op: string, id: string, extra: Record<string, string> = {}) { return "/api/manga?" + new URLSearchParams({ op, id, provider: source?.provider || "mangadex", ...extra }); }
 async function mangaJson(url: string, signal: AbortSignal) { const r = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) }); if ([401, 402, 403, 429].includes(r.status)) throw new Error("来源暂时限制了请求"); const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || "漫画来源暂不可用"); return d; }
 useEffect(() => { cancelDownload(); cancelSelectAll(); ++contextNumber.current; setSelectedIds(new Set()); setSelecting(false); setBatchProgress(null); progressRef.current = null; setCacheMessage(""); setDeleting(false); }, [sourceKey, lang, localChapterId]);
 useEffect(() => {
  let active = true, n = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => { const number = ++n; void listCachedChapters().then(records => { if (active && number === n) setCachedRecords(new Map(records.filter(record => record.sourceKey === sourceKey && record.lang === lang).map(record => [record.id, record]))); }).catch(() => {}); };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, 150); }; refresh(); window.addEventListener("dongdong-comic-cache", schedule);
  return () => { active = false; clearTimeout(timer); window.removeEventListener("dongdong-comic-cache", schedule); };
 }, [sourceKey, lang]);
 useEffect(() => { if (images.length) { reader.current?.scrollIntoView({ behavior: "smooth", block: "start" }); reader.current?.focus({ preventScroll: true }); } }, [images]);
 useEffect(() => { const update = () => setFullscreen(document.fullscreenElement === reader.current); document.addEventListener("fullscreenchange", update); return () => document.removeEventListener("fullscreenchange", update); }, []);
 useEffect(() => {
  if (!localChapterId) return; let active = true; pending.current?.abort(); setLoading(true); setError("");
  void getCachedChapter(localChapterId).then(record => { if (!active) return; if (!record) throw new Error("本地章节已移除"); setSourceKey(record.sourceKey); setLang(record.lang); setChapters([record.chapter]); setChapter(record.chapter); setImages(record.images); setCacheRecord(record); setLoadedPage(null); setPage(record.cachedIndexes.includes(record.lastPage) ? record.lastPage : record.cachedIndexes[0] || 0); }).catch(error => { if (active) setError(error instanceof Error ? error.message : "本地缓存不可用"); }).finally(() => { if (active) setLoading(false); });
  return () => { active = false; };
 }, [localChapterId]);
 useEffect(() => {
  if (localChapterId) return;
  cancelDownload(); pending.current?.abort(); const abort = new AbortController(); pending.current = abort; const n = ++readNumber.current;
  setError(""); setChapters([]); setChapter(null); setImages([]); setTotal(0); setOffset(0); setPage(0); setLoadedPage(null); setCacheRecord(null); setCacheMessage(""); setLoading(source?.mode === "inline");
  if (source?.mode === "inline") mangaJson(endpoint("chapters", source.id, { lang }), abort.signal).then((d: ChapterPage) => { if (abort.signal.aborted || n !== readNumber.current) return; const next = nextChapterPage(d, 0); setChapters(mergeChapters([], d.chapters)); setTotal(d.total); setOffset(next); }).catch(e => { if (!abort.signal.aborted && n === readNumber.current) setError(e.message); }).finally(() => { if (!abort.signal.aborted && n === readNumber.current) setLoading(false); });
  return () => { abort.abort(); pending.current?.abort(); ++readNumber.current; };
 }, [source?.provider, source?.id, source?.mode, lang, localChapterId]);
 useEffect(() => { if (!chapterCacheId || !images.length) return; let active = true; void getCachedChapter(chapterCacheId).then(record => { if (active) setCacheRecord(previous => record && previous?.id === record.id && previous.updatedAt > record.updatedAt ? previous : record); }).catch(() => {}); return () => { active = false; }; }, [chapterCacheId, images]);
 useEffect(() => { if (chapterCacheId && cacheRecord) void setCachedReadingPage(chapterCacheId, page).catch(() => {}); }, [chapterCacheId, page, !!cacheRecord]);
 useEffect(() => {
  if (!source || !images.length || caching || loadedPage?.id !== chapterCacheId || loadedPage.page !== page) return;
  const abort = new AbortController();
  void (async () => { for (let index = page + 1; index <= Math.min(page + 3, images.length - 1); index++) { if (abort.signal.aborted) return; await imageCache.get(images[index], source.provider, { chapterId: chapterCacheId, page: index, signal: abort.signal }); } })().catch(() => {});
  return () => abort.abort();
 }, [images, page, source?.provider, chapterCacheId, loadedPage, caching, imageCache]);
 async function more() {
  if (!source || selectingAll || loading) return; pending.current?.abort(); const abort = new AbortController(); pending.current = abort; const n = ++readNumber.current; setLoading(true); setError("");
  try { const d = await mangaJson(endpoint("chapters", source.id, { lang, offset: String(offset) }), abort.signal) as ChapterPage; if (abort.signal.aborted || n !== readNumber.current) return; const next = nextChapterPage(d, offset); setChapters(v => mergeChapters(v, d.chapters)); setTotal(d.total); setOffset(next); } catch (e) { if (!abort.signal.aborted && n === readNumber.current) setError(e instanceof Error ? e.message : "章节读取失败"); } finally { if (!abort.signal.aborted && n === readNumber.current) setLoading(false); }
 }
 async function read(c: Chapter) {
  if (!source) return; if (c.externalUrl) { window.open(c.externalUrl, "_blank", "noopener,noreferrer"); return; }
  if (downloadMode.current === "single") cancelDownload(); pending.current?.abort(); const abort = new AbortController(); pending.current = abort; const n = ++readNumber.current; setChapter(c); setImages([]); setLoading(true); setError(""); setPage(0); setCacheRecord(null); if (!caching) setCacheMessage(""); setLoadedPage(null);
  try {
   const id = localChapterId || cachedChapterId(sourceKey, c.id, lang), local = await getCachedChapter(id).catch(() => null); if (abort.signal.aborted || n !== readNumber.current) return;
   if (local) { setImages(local.images); setCacheRecord(local); setPage(local.cachedIndexes.includes(local.lastPage) ? local.lastPage : local.cachedIndexes[0] || 0); return; }
   const d = await mangaJson(endpoint("pages", c.id, { comic: source.id }), abort.signal); if (abort.signal.aborted || n !== readNumber.current) return; setImages(d.images);
  } catch (e) { if (!abort.signal.aborted && n === readNumber.current) setError(e instanceof Error ? e.message : "章节读取失败"); } finally { if (!abort.signal.aborted && n === readNumber.current) setLoading(false); }
 }
 async function selectAll() {
  if (!source || loading || selectingAll || caching || deleting) return;
  const abort = new AbortController(), context = contextNumber.current; allPending.current = abort; setSelectingAll(true); setCacheMessage("");
  try {
   const all = await collectAllChapters({ chapters, total, nextOffset: offset }, async (at, signal) => mangaJson(endpoint("chapters", source.id, { lang, offset: String(at) }), signal), abort.signal, value => { if (!abort.signal.aborted && context === contextNumber.current) { setChapters(value.chapters); setTotal(value.total); setOffset(value.nextOffset); } });
   if (!abort.signal.aborted && context === contextNumber.current) { setChapters(all.chapters); setTotal(all.total); setOffset(all.nextOffset); setSelectedIds(new Set(all.chapters.filter(c => !c.externalUrl).map(c => c.id))); }
  } catch (e) { if (!abort.signal.aborted && context === contextNumber.current) setCacheMessage(e instanceof Error ? e.message : "章节读取失败"); }
  finally { if (allPending.current === abort) { allPending.current = null; setSelectingAll(false); } }
 }
 function toggleChapter(id: string) { setSelectedIds(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
 async function cacheChapters(values: Chapter[], mode: "single" | "batch") {
  if (!source || !values.length || caching || download.current || deleting) return;
  const abort = new AbortController(), context = contextNumber.current, key = sourceKey, selectedLang = lang, currentChapter = chapter, currentImages = [...images]; download.current = abort; downloadMode.current = mode; setCaching(true); setCacheMessage(""); setBatchProgress(null); progressRef.current = null;
  const shellReady = prepareOfflineShell(), valid = () => alive.current && download.current === abort && !abort.signal.aborted && context === contextNumber.current;
  try {
   const done = await cacheChaptersSequential({
    chapters: values, signal: abort.signal,
    getRecord: c => getCachedChapter(localChapterId && values.length === 1 ? localChapterId : cachedChapterId(key, c.id, selectedLang)),
    getImages: async (c, signal) => currentChapter?.id === c.id && currentImages.length ? currentImages : (await mangaJson(endpoint("pages", c.id, { comic: source.id }), signal)).images,
    prepare: (c, selectedImages, signal) => prepareCachedChapter({ id: localChapterId && values.length === 1 ? localChapterId : cachedChapterId(key, c.id, selectedLang), work, chapter: c, sourceKey: key, lang: selectedLang, images: selectedImages }, signal),
    getImage: (src, record, index, signal) => imageCache.get(src, source.provider, { chapterId: record.id, page: index, signal }),
    save: (record, index, blob, signal) => saveCachedPage(record.id, index, blob, signal),
    onRecord: record => { if (valid()) { setCachedRecords(old => new Map(old).set(record.id, record)); if (currentCacheId.current === record.id) setCacheRecord(record); } },
    onProgress: progress => { if (valid()) { progressRef.current = progress; setBatchProgress(progress); } },
   });
   const ready = await shellReady; if (valid()) setCacheMessage(mode === "batch" ? "已缓存 " + done + " 章" + (ready ? "" : " · 需联网打开网站") : ready ? "" : "已缓存 · 需联网打开网站");
  } catch (e) { if (valid()) setCacheMessage(e instanceof Error ? e.message : "缓存失败"); }
  finally { if (download.current === abort) { download.current = null; downloadMode.current = null; setCaching(false); } }
 }
 async function clearChapter() { if (!chapterCacheId || deleting) return; const id = chapterCacheId, context = contextNumber.current; cancelDownload(); setDeleting(true); try { await deleteCachedChapter(id); if (alive.current && context === contextNumber.current) { setCacheRecord(null); setCachedRecords(old => { const next = new Map(old); next.delete(id); return next; }); setCacheMessage(""); } } catch (e) { if (alive.current && context === contextNumber.current) setCacheMessage(e instanceof Error ? e.message : "缓存清理失败"); } finally { if (alive.current && context === contextNumber.current) setDeleting(false); } }
 async function clearSelected() { if (!selectedCacheIds.length || deleting) return; const ids = [...selectedCacheIds], context = contextNumber.current; cancelDownload(); setDeleting(true); try { await deleteCachedChapters(ids); if (alive.current && context === contextNumber.current) { setCachedRecords(old => { const next = new Map(old); ids.forEach(id => next.delete(id)); return next; }); if (ids.includes(currentCacheId.current)) setCacheRecord(null); setCacheMessage("已删除 " + ids.length + " 章缓存"); } } catch (e) { if (alive.current && context === contextNumber.current) setCacheMessage(e instanceof Error ? e.message : "缓存清理失败"); } finally { if (alive.current && context === contextNumber.current) setDeleting(false); } }
 const progressText = batchProgress ? batchProgress.completed + "/" + batchProgress.total + " 章 · " + batchProgress.pages + "/" + batchProgress.pageTotal + " 页" : "准备缓存…";
 if (!source) return null;
 return <section className="manga-section"><div className="section-heading"><h2><BookOpen size={20}/>{source.name}</h2><div className="manga-source-actions"><a className="text-button" href={source.url} target="_blank" rel="noopener noreferrer">原站<ExternalLink size={14}/></a>{source.provider === "mangadex" && !localChapterId && <Select value={lang} onValueChange={value => { cancelDownload(); cancelSelectAll(); setLang(value); }}><SelectTrigger aria-label="章节语言"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="zh">简体 / 繁体中文</SelectItem><SelectItem value="all">全部语言</SelectItem></SelectContent></Select>}<button className="secondary-button" onClick={() => setSourceOpen(true)}><Layers3 size={17}/>选择分流 · {sources.length}</button></div></div>
 <Dialog open={sourceOpen} onOpenChange={setSourceOpen}><DialogContent className="source-dialog" aria-describedby={undefined}><DialogHeader><DialogTitle>选择漫画分流</DialogTitle></DialogHeader><div className="source-options">{sources.map(s => <button key={s.provider + ":" + s.id} className={source === s ? "selected" : ""} onClick={() => { if (s.provider + ":" + s.id !== sourceKey) { cancelDownload(); cancelSelectAll(); setLocalChapterId(""); setSourceKey(s.provider + ":" + s.id); } setSourceOpen(false); }}><span className="source-symbol"><BookOpen size={22}/></span><span><strong>{s.name}</strong><small>{s.mode === "inline" ? "站内阅读" : "外站阅读"}</small></span>{source === s && <Check size={21}/>}</button>)}</div></DialogContent></Dialog>
 {source.mode === "external" ? <div className="comic-external"><a className="secondary-button" href={source.url} target="_blank" rel="noopener noreferrer">前往 {source.name} 阅读<ExternalLink size={16}/></a></div> : <>
 {loading && !chapter && <p className="loading-text">正在读取章节…</p>}{!loading && !chapters.length && !error && <div className="empty-result"><h3>{source.provider === "mangadex" && lang === "zh" ? "暂无中文章节" : "暂无章节"}</h3></div>}
 {!localChapterId && chapters.length > 0 && <div className="comic-batch-toolbar">
  <button className="subtle-button" aria-pressed={selecting} disabled={deleting} onClick={() => { if (selecting) { cancelSelectAll(); setSelectedIds(new Set()); } setSelecting(!selecting); }}>{selecting ? "完成选择" : "批量缓存"}</button>
  {selecting && <>
   {selectingAll ? <button className="subtle-button" onClick={cancelSelectAll}><X size={15}/>取消全选</button> : <button className="subtle-button" disabled={loading || caching || deleting} onClick={() => void selectAll()}>全选</button>}
   <button className="subtle-button" disabled={!selectedIds.size || selectingAll || deleting} onClick={() => setSelectedIds(new Set())}>取消选择</button>
   <span className="comic-selection-count">已选 {selectedChapters.length} 章{selectingAll ? " · 读取全部章节…" : ""}</span>
   {!caching && <button className="secondary-button" disabled={!selectedChapters.length || selectingAll || deleting} onClick={() => void cacheChapters(selectedChapters, "batch")}><Download size={16}/>缓存所选</button>}
   <button className="subtle-button" disabled={!selectedCacheIds.length || selectingAll || deleting} onClick={() => void clearSelected()}><Trash2 size={15}/>{deleting ? "正在删除…" : "删除缓存"}</button>
  </>}
  {caching && <><button className="subtle-button" onClick={() => cancelDownload(true)}><X size={15}/>取消缓存</button><span className="comic-cache-progress" role="status">{progressText}</span></>}
  {!caching && cacheMessage && <span className="comic-cache-progress" role="status">{cacheMessage}</span>}
 </div>}
 <div className={"chapter-list" + (selecting ? " chapter-list-selecting" : "")}>{chapters.map(c => { const record = cachedRecords.get(cachedChapterId(sourceKey, c.id, lang)); const title = c.title || (c.chapter ? "第 " + c.chapter + " 话" : "番外"); return <div className={"chapter-choice" + (selectedIds.has(c.id) ? " checked" : "")} key={c.id}>
  {selecting && <label className="comic-checkbox"><input type="checkbox" aria-label={"选择章节：" + title} checked={selectedIds.has(c.id)} disabled={!!c.externalUrl || selectingAll || deleting} onChange={() => toggleChapter(c.id)}/><span aria-hidden="true"><Check size={14}/></span></label>}
  <button className={chapter?.id === c.id ? "selected" : ""} onClick={() => void read(c)}><strong>{title}</strong>{(c.pages > 0 || c.groups || record) && <span>{[c.pages > 0 ? c.pages + " 页" : "", c.groups, record ? record.complete ? "已缓存" : record.cachedPages + "/" + record.images.length + " 页缓存" : ""].filter(Boolean).join(" · ")}</span>}</button>
 </div>; })}</div>{!localChapterId && offset < total && <button className="subtle-button" disabled={loading || selectingAll} onClick={() => void more()}>加载更多章节</button>}
 {chapter && <div className="reading-area" ref={reader} tabIndex={0} aria-label="漫画阅读器，左右方向键翻页" onKeyDown={e => { if (e.key === "Escape" && document.fullscreenElement === reader.current) { e.preventDefault(); void document.exitFullscreen(); return; } if (!images.length || loading || (e.target as HTMLElement).closest("input,[role=combobox]")) return; if (e.key === "ArrowRight") { e.preventDefault(); setPage(p => Math.min(images.length - 1, p + 1)); } else if (e.key === "ArrowLeft") { e.preventDefault(); setPage(p => Math.max(0, p - 1)); } }}><div className="reader-controls"><span>{chapter.title || "第 " + (chapter.chapter || "番外") + " 话"}</span><div className="comic-cache-controls">{images.length > 0 && <>{caching ? <button onClick={() => cancelDownload(true)} aria-label="取消缓存"><X size={16}/>取消 · {progressText}</button> : <button disabled={!!cacheRecord?.complete || deleting} onClick={() => void cacheChapters([chapter], "single")}><Download size={16}/>{cacheRecord?.complete ? "已缓存" : "缓存本章"}</button>}{cacheRecord && <button disabled={deleting} onClick={() => void clearChapter()} aria-label="清理本章缓存"><Trash2 size={16}/>清理</button>}{cacheMessage && <span className="comic-cache-progress" role="status">{cacheMessage}</span>}</>}<button onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : reader.current?.requestFullscreen())?.catch(() => setError("当前浏览器未允许全屏"))}><Maximize size={17}/>{fullscreen ? "退出全屏" : "全屏阅读"}</button></div></div>{loading && <p className="loading-text">正在读取图片…</p>}{images.length > 0 && <><div className="comic-page"><ComicPageImage src={images[page]} page={page} provider={source.provider} cache={imageCache} chapterId={chapterCacheId} onError={setError} onLoaded={loaded => setLoadedPage(old => old?.id === chapterCacheId && old.page === loaded ? old : { id: chapterCacheId, page: loaded })}/></div><div className="page-navigation"><button disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="上一页"><ChevronLeft/>上一页</button><span>{page + 1} / {images.length}</span><button disabled={page === images.length - 1} onClick={() => setPage(page + 1)} aria-label="下一页">下一页<ChevronRight/></button></div><div className="page-strip">{images.map((_, i) => <button className={page === i ? "selected" : ""} key={i} onClick={() => setPage(i)}>{i + 1}</button>)}</div></>}{error && <p className="playback-message" role="alert">{error}<button className="text-button" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen().then(() => setSourceOpen(true)); else setSourceOpen(true); }}>切换分流</button></p>}</div>}
 </>}{error && !chapter && <p className="playback-message" role="alert">{error}</p>}
 </section>;
}
