"use client";
import { useEffect, useState } from "react";
import { BookOpen, ChevronLeft, FolderOpen, Trash2 } from "lucide-react";
import MangaReader from "@/components/manga-reader";
import MediaPlayer from "@/components/media-player";
import { listCachedChapters, deleteCachedChapter, type CachedChapter } from "@/lib/comic-cache";

function size(bytes: number) { return (bytes / 1048576).toFixed(1) + " MB"; }

export default function OfflineLibrary() {
  const [chapters, setChapters] = useState<CachedChapter[]>([]);
  const [reading, setReading] = useState<CachedChapter | null>(null);
  const [video, setVideo] = useState<{ url: string; name: string; file: File } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = () => { void listCachedChapters().then(items => { if (active) setChapters(items); }).catch(() => { if (active) setError("当前浏览器无法读取本地缓存"); }); };
    refresh();
    window.addEventListener("dongdong-comic-cache", refresh);
    return () => { active = false; window.removeEventListener("dongdong-comic-cache", refresh); };
  }, []);
  useEffect(() => () => { if (video) URL.revokeObjectURL(video.url); }, [video]);
  async function remove(id: string) {
    try { await deleteCachedChapter(id); setError(""); } catch { setError("缓存暂时无法删除"); }
  }
  return <section className="offline-library">
    <div className="section-heading"><h2>本地缓存</h2><label className="upload-sub"><FolderOpen size={18}/>打开本地视频<input type="file" accept="video/mp4,video/webm,.mp4,.webm,.m4v" aria-label="打开本地视频" onChange={event => { const file = event.target.files?.[0]; if (file) { setReading(null); setVideo({ url: URL.createObjectURL(file), name: file.name, file }); } event.target.value = ""; }}/></label></div>
    {reading || video ? <div className="offline-reading"><button className="back-button" onClick={() => { setReading(null); setVideo(null); }}><ChevronLeft size={18}/>返回缓存</button>{reading ? <><h3>{reading.work.title}</h3><MangaReader key={reading.id} work={reading.work} initialCachedChapterId={reading.id}/></> : video ? <MediaPlayer key={video.url} localVideo={video.file} episode={{ label: video.name, url: video.url }} title={video.name}/> : null}</div> : chapters.length ? <div className="offline-chapters">{chapters.map(record => <div key={record.id}><button className="offline-chapter" onClick={() => { setReading(record); setVideo(null); }}><BookOpen size={22}/><span><strong>{record.work.title}</strong><small>{record.chapter.title || "第 " + (record.chapter.chapter || "番外") + " 话"} · {record.complete ? "已缓存" : record.cachedPages + "/" + record.images.length + " 页"} · {size(record.bytes)}</small></span></button><button className="icon-button" aria-label={"删除缓存：" + record.work.title + " " + (record.chapter.title || record.chapter.chapter)} onClick={() => void remove(record.id)}><Trash2 size={17}/></button></div>)}</div> : <p className="offline-empty">暂无缓存</p>}
    {error && <p className="playback-message" role="alert">{error}</p>}
  </section>;
}
