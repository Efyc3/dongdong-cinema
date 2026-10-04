import type { CachedChapter, Chapter } from "@/lib/comic-cache";

export type ChapterPage = { chapters: Chapter[]; total: number; limit: number; offset?: number };
export type ChapterCatalogue = { chapters: Chapter[]; total: number; nextOffset: number };
export type ComicBatchProgress = { completed: number; total: number; title: string; pages: number; pageTotal: number };

export function checkComicAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
}
export function mergeChapters(previous: Chapter[], incoming: Chapter[]): Chapter[] {
  const known = new Set(previous.map(chapter => chapter.id));
  return [...previous, ...incoming.filter(chapter => { if (known.has(chapter.id)) return false; known.add(chapter.id); return true; })];
}
export function nextChapterPage(page: ChapterPage, requestedOffset: number): number {
  if (!Array.isArray(page.chapters) || !Number.isSafeInteger(page.total) || page.total < 0 || !Number.isSafeInteger(page.limit) || page.limit < 0 || (page.offset !== undefined && page.offset !== requestedOffset)) throw new Error("章节列表暂不可用");
  if (page.total > requestedOffset && !page.limit) throw new Error("章节列表未完整返回");
  return requestedOffset + page.limit;
}
/** Walk the upstream cursor, including pages whose unavailable chapters were filtered out. */
export async function collectAllChapters(initial: ChapterCatalogue, fetchPage: (offset: number, signal: AbortSignal) => Promise<ChapterPage>, signal: AbortSignal, onPage?: (catalogue: ChapterCatalogue) => void): Promise<ChapterCatalogue> {
  let current = { ...initial, chapters: mergeChapters([], initial.chapters) };
  checkComicAbort(signal);
  while (current.nextOffset < current.total) {
    const requested = current.nextOffset, page = await fetchPage(requested, signal);
    checkComicAbort(signal);
    const nextOffset = nextChapterPage(page, requested);
    if (nextOffset <= requested) throw new Error("章节列表未完整返回");
    current = { chapters: mergeChapters(current.chapters, page.chapters), total: page.total, nextOffset };
    onPage?.(current);
  }
  checkComicAbort(signal);
  return current;
}

/** One chapter and one missing image at a time. Re-running retains all persisted progress. */
export async function cacheChaptersSequential(options: {
  chapters: Chapter[];
  signal: AbortSignal;
  getRecord: (chapter: Chapter) => Promise<CachedChapter | null>;
  getImages: (chapter: Chapter, signal: AbortSignal) => Promise<string[]>;
  prepare: (chapter: Chapter, images: string[], signal: AbortSignal) => Promise<CachedChapter>;
  getImage: (src: string, record: CachedChapter, index: number, signal: AbortSignal) => Promise<Blob>;
  save: (record: CachedChapter, index: number, blob: Blob, signal: AbortSignal) => Promise<CachedChapter>;
  onRecord?: (record: CachedChapter) => void;
  onProgress?: (progress: ComicBatchProgress) => void;
}): Promise<number> {
  const { signal } = options, chapters = mergeChapters([], options.chapters).filter(chapter => !chapter.externalUrl);
  let completed = 0;
  for (const chapter of chapters) {
    checkComicAbort(signal);
    let record = await options.getRecord(chapter);
    checkComicAbort(signal);
    const title = chapter.title || "第 " + (chapter.chapter || "番外") + " 话";
    const progress = () => options.onProgress?.({ completed, total: chapters.length, title, pages: record?.cachedPages || 0, pageTotal: record?.images.length || chapter.pages || 0 });
    progress();
    if (!record?.complete) {
      const images = record?.images.length ? record.images : await options.getImages(chapter, signal);
      checkComicAbort(signal);
      if (!images.length) throw new Error("章节暂无图片");
      record = await options.prepare(chapter, images, signal);
      checkComicAbort(signal); progress(); options.onRecord?.(record);
      const saved = new Set(record.cachedIndexes);
      for (let index = 0; index < images.length; index++) {
        checkComicAbort(signal);
        if (saved.has(index)) continue;
        const blob = await options.getImage(images[index], record, index, signal);
        checkComicAbort(signal);
        record = await options.save(record, index, blob, signal);
        checkComicAbort(signal); saved.add(index); progress(); options.onRecord?.(record);
      }
    }
    checkComicAbort(signal);
    if (!record?.complete) throw new Error("章节缓存未完成");
    completed++; progress(); options.onRecord?.(record);
  }
  checkComicAbort(signal);
  return completed;
}
