"use client";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, ChevronLeft, FolderOpen, Trash2 } from "lucide-react";
import MangaReader from "@/components/manga-reader";
import MediaPlayer from "@/components/media-player";
import { listCachedChapters, deleteCachedChapters, type CachedChapter } from "@/lib/comic-cache";

function size(bytes: number) { return (bytes / 1048576).toFixed(1) + " MB"; }

export default function OfflineLibrary() {
  const [chapters, setChapters] = useState<CachedChapter[]>([]);
  const [reading, setReading] = useState<CachedChapter | null>(null);
  const [video, setVideo] = useState<{ url: string; name: string; file: File } | null>(null);
  const [error, setError] = useState("");
  const [managing, setManaging] = useState(false), [selected, setSelected] = useState<Set<string>>(() => new Set()), [deleting, setDeleting] = useState(false);
  const active = useRef(false), deleteBusy = useRef(false);
  useEffect(() => {
    active.current = true; let sequence = 0;
    const refresh = () => { const number = ++sequence; void listCachedChapters().then(items => { if (active.current && number === sequence) { setChapters(items); setSelected(previous => new Set([...previous].filter(id => items.some(item => item.id === id)))); } }).catch(() => { if (active.current && number === sequence) setError("当前浏览器无法读取本地缓存"); }); };
    refresh();
    window.addEventListener("dongdong-comic-cache", refresh);
    return () => { active.current = false; ++sequence; window.removeEventListener("dongdong-comic-cache", refresh); };
  }, []);
  useEffect(() => () => { if (video) URL.revokeObjectURL(video.url); }, [video]);
  function toggle(id: string) { setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  async function remove(ids: string[]) {
    if (!ids.length || deleteBusy.current) return; deleteBusy.current = true; setDeleting(true);
    try { await deleteCachedChapters(ids); if (active.current) { setError(""); setSelected(previous => new Set([...previous].filter(id => !ids.includes(id)))); } } catch { if (active.current) setError("缓存暂时无法删除"); }
    finally { deleteBusy.current = false; if (active.current) setDeleting(false); }
  }
  return <section className="offline-library">
    <div className="section-heading"><h2>本地缓存</h2><label className="upload-sub"><FolderOpen size={18}/>打开本地视频<input type="file" accept="video/mp4,video/webm,.mp4,.webm,.m4v" aria-label="打开本地视频" onChange={event => { const file = event.target.files?.[0]; if (file) { setReading(null); setVideo({ url: URL.createObjectURL(file), name: file.name, file }); } event.target.value = ""; }}/></label></div>
    {reading || video ? <div className="offline-reading"><button className="back-button" onClick={() => { setReading(null); setVideo(null); }}><ChevronLeft size={18}/>返回缓存</button>{reading ? <><h3>{reading.work.title}</h3><MangaReader key={reading.id} work={reading.work} initialCachedChapterId={reading.id}/></> : video ? <MediaPlayer key={video.url} localVideo={video.file} episode={{ label: video.name, url: video.url }} title={video.name}/> : null}</div> : chapters.length ? <>
      <div className="comic-batch-toolbar offline-cache-toolbar"><button className="subtle-button" aria-pressed={managing} disabled={deleting} onClick={() => { setManaging(!managing); setSelected(new Set()); }}>{managing ? "完成" : "管理缓存"}</button>{managing && <>
        <button className="subtle-button" disabled={deleting} onClick={() => setSelected(new Set(chapters.map(record => record.id)))}>全选</button>
        <button className="subtle-button" disabled={!selected.size || deleting} onClick={() => setSelected(new Set())}>取消选择</button>
        <span className="comic-selection-count">已选 {selected.size} 章</span>
        <button className="secondary-button" disabled={!selected.size || deleting} onClick={() => void remove([...selected])}><Trash2 size={16}/>{deleting ? "正在删除…" : "删除所选"}</button>
      </>}</div>
      <div className="offline-chapters">{chapters.map(record => <div key={record.id} className={selected.has(record.id) ? "checked" : ""}>
        {managing && <label className="comic-checkbox"><input type="checkbox" aria-label={"选择缓存：" + record.work.title + " " + (record.chapter.title || record.chapter.chapter)} checked={selected.has(record.id)} disabled={deleting} onChange={() => toggle(record.id)}/><span aria-hidden="true"><Check size={14}/></span></label>}
        <button className="offline-chapter" disabled={deleting} onClick={() => { if (managing) toggle(record.id); else { setReading(record); setVideo(null); } }}><BookOpen size={22}/><span><strong>{record.work.title}</strong><small>{record.chapter.title || "第 " + (record.chapter.chapter || "番外") + " 话"} · {record.complete ? "已缓存" : record.cachedPages + "/" + record.images.length + " 页"} · {size(record.bytes)}</small></span></button>
        {!managing && <button className="icon-button" disabled={deleting} aria-label={"删除缓存：" + record.work.title + " " + (record.chapter.title || record.chapter.chapter)} onClick={() => void remove([record.id])}><Trash2 size={17}/></button>}
      </div>)}</div>
    </> : <p className="offline-empty">暂无缓存</p>}
    {error && <p className="playback-message" role="alert">{error}</p>}
  </section>;
}
