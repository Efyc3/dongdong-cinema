"use client";
import { useEffect, useState } from "react";
import { type ComicPageCache } from "@/lib/comic-cache";
export default function ComicPageImage({ src, page, provider, cache, chapterId, onError, onLoaded }: { src: string; page: number; provider: string; cache: ComicPageCache; chapterId?: string; onError: (value: string) => void; onLoaded: (page: number) => void }) {
 const [image, setImage] = useState(""), [busy, setBusy] = useState(false);
 useEffect(() => {
  const abort = new AbortController(); let local = ""; setImage(""); setBusy(true);
  void cache.get(src, provider, { chapterId, page, signal: abort.signal }).then(blob => { if (abort.signal.aborted) return; local = URL.createObjectURL(blob); setImage(local); onError(""); }).catch(error => { if (!abort.signal.aborted) onError(error instanceof TypeError || error?.name === "TimeoutError" ? "图片暂不可用" : error instanceof Error ? error.message : "图片暂不可用"); }).finally(() => { if (!abort.signal.aborted) setBusy(false); });
  return () => { abort.abort(); if (local) URL.revokeObjectURL(local); };
 }, [src, provider, cache, chapterId, page]);
 return <>{busy && <p className="loading-text">正在读取图片…</p>}{image && <img src={image} alt={"第 " + (page + 1) + " 页"} onLoad={() => { onError(""); onLoaded(page); }} onError={() => onError("这一页暂时无法读取，请换一个分流。")} />}</>;
}
