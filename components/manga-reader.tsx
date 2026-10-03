"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Maximize, ExternalLink, ChevronLeft, ChevronRight, Layers3, Check } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mangaSources, type Work } from "@/lib/media";
import ComicPageImage from "@/components/comic-page-image";
type Chapter={id:string;chapter:string;volume:string;title:string;pages:number;lang:string;groups:string;externalUrl:string};
export default function MangaReader({work}:{work:Work}){
 const sources=useMemo(()=>mangaSources(work),[work]);
 const [sourceKey,setSourceKey]=useState(()=>{const s=sources.find(s=>s.mode==="inline")||sources[0];return s?s.provider+":"+s.id:"";}),[sourceOpen,setSourceOpen]=useState(false);
 const source=sources.find(s=>s.provider+":"+s.id===sourceKey)||sources[0];
 const [chapters,setChapters]=useState<Chapter[]>([]),[lang,setLang]=useState("zh"),[total,setTotal]=useState(0),[chapter,setChapter]=useState<Chapter|null>(null),[images,setImages]=useState<string[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(""),[offset,setOffset]=useState(0),[page,setPage]=useState(0),[fullscreen,setFullscreen]=useState(false);
 const reader=useRef<HTMLDivElement>(null),readNumber=useRef(0),pending=useRef<AbortController|null>(null),imageCache=useRef(new Map<string,string>());
 useEffect(()=>()=>{for(const url of imageCache.current.values())URL.revokeObjectURL(url);imageCache.current.clear();},[]);
 function endpoint(op:string,id:string,extra:Record<string,string>={}){return "/api/manga?"+new URLSearchParams({op,id,provider:source?.provider||"mangadex",...extra});}
 useEffect(()=>{if(images.length){reader.current?.scrollIntoView({behavior:"smooth",block:"start"});reader.current?.focus({preventScroll:true});}},[images]);
 useEffect(()=>{const update=()=>setFullscreen(document.fullscreenElement===reader.current);document.addEventListener("fullscreenchange",update);return()=>document.removeEventListener("fullscreenchange",update);},[]);
 useEffect(()=>{
  pending.current?.abort();const abort=new AbortController();pending.current=abort;const n=++readNumber.current;
  setError("");setChapters([]);setChapter(null);setImages([]);setTotal(0);setOffset(0);setPage(0);setLoading(source?.mode==="inline");
  if(source?.mode==="inline")fetch(endpoint("chapters",source.id,{lang}),{signal:abort.signal}).then(r=>r.json() as Promise<any>).then(d=>{if(n!==readNumber.current)return;if(d.error)throw new Error(d.error);setChapters(d.chapters);setTotal(d.total);setOffset(d.limit);}).catch(e=>{if(!abort.signal.aborted&&n===readNumber.current)setError(e.message);}).finally(()=>{if(!abort.signal.aborted&&n===readNumber.current)setLoading(false);});
  return()=>{abort.abort();pending.current?.abort();++readNumber.current;};
 },[source?.provider,source?.id,source?.mode,lang]);
 async function more(){
  pending.current?.abort();const abort=new AbortController();pending.current=abort;const n=++readNumber.current;setLoading(true);setError("");
  try{const d=await fetch(endpoint("chapters",source.id,{lang,offset:String(offset)}),{signal:abort.signal}).then(r=>r.json() as Promise<any>);if(n!==readNumber.current)return;if(d.error)throw new Error(d.error);setChapters(v=>[...v,...d.chapters.filter((c:Chapter)=>!v.some(old=>old.id===c.id))]);setOffset(offset+d.limit);}catch(e){if(!abort.signal.aborted&&n===readNumber.current)setError(e instanceof Error?e.message:"章节读取失败");}finally{if(!abort.signal.aborted&&n===readNumber.current)setLoading(false);}
 }
 async function read(c:Chapter){
  if(c.externalUrl){window.open(c.externalUrl,"_blank","noopener,noreferrer");return;}
  pending.current?.abort();const abort=new AbortController();pending.current=abort;const n=++readNumber.current;setChapter(c);setImages([]);setLoading(true);setError("");setPage(0);
  try{const d=await fetch(endpoint("pages",c.id,{comic:source.id}),{signal:abort.signal}).then(r=>r.json() as Promise<any>);if(n!==readNumber.current)return;if(d.error)throw new Error(d.error);setImages(d.images);}catch(e){if(!abort.signal.aborted&&n===readNumber.current)setError(e instanceof Error?e.message:"章节读取失败");}finally{if(!abort.signal.aborted&&n===readNumber.current)setLoading(false);}
 }
 if(!source)return null;
 return <section className="manga-section"><div className="section-heading"><h2><BookOpen size={20}/>{source.name}</h2><div className="manga-source-actions"><a className="text-button" href={source.url} target="_blank" rel="noopener noreferrer">原站<ExternalLink size={14}/></a>{source.provider==="mangadex"&&<Select value={lang} onValueChange={setLang}><SelectTrigger aria-label="章节语言"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="zh">简体 / 繁体中文</SelectItem><SelectItem value="all">全部语言</SelectItem></SelectContent></Select>}<button className="secondary-button" onClick={()=>setSourceOpen(true)}><Layers3 size={17}/>选择分流 · {sources.length}</button></div></div>
 <Dialog open={sourceOpen} onOpenChange={setSourceOpen}><DialogContent className="source-dialog" aria-describedby={undefined}><DialogHeader><DialogTitle>选择漫画分流</DialogTitle></DialogHeader><div className="source-options">{sources.map(s=><button key={s.provider+":"+s.id} className={source===s?"selected":""} onClick={()=>{setSourceKey(s.provider+":"+s.id);setSourceOpen(false);}}><span className="source-symbol"><BookOpen size={22}/></span><span><strong>{s.name}</strong><small>{s.mode==="inline"?"站内阅读":"外站阅读"}</small></span>{source===s&&<Check size={21}/>}</button>)}</div></DialogContent></Dialog>
 {source.mode==="external"?<div className="comic-external"><a className="secondary-button" href={source.url} target="_blank" rel="noopener noreferrer">前往 {source.name} 阅读<ExternalLink size={16}/></a></div>:<>
 {loading&&!chapter&&<p className="loading-text">正在读取章节…</p>}{!loading&&!chapters.length&&!error&&<div className="empty-result"><h3>{source.provider==="mangadex"&&lang==="zh"?"暂无中文章节":"暂无章节"}</h3></div>}
 <div className="chapter-list">{chapters.map(c=><button key={c.id} className={chapter?.id===c.id?"selected":""} onClick={()=>void read(c)}><strong>{c.title|| (c.chapter?"第 "+c.chapter+" 话":"番外")}</strong>{(c.pages>0||c.groups)&&<span>{[c.pages>0?c.pages+" 页":"",c.groups].filter(Boolean).join(" · ")}</span>}</button>)}</div>{offset<total&&<button className="subtle-button" disabled={loading} onClick={()=>void more()}>加载更多章节</button>}
 {chapter&&<div className="reading-area" ref={reader} tabIndex={0} aria-label="漫画阅读器，左右方向键翻页" onKeyDown={e=>{if(e.key==="Escape"&&document.fullscreenElement===reader.current){e.preventDefault();void document.exitFullscreen();return;}if(!images.length||loading||(e.target as HTMLElement).closest("input,[role=combobox]"))return;if(e.key==="ArrowRight"){e.preventDefault();setPage(p=>Math.min(images.length-1,p+1));}else if(e.key==="ArrowLeft"){e.preventDefault();setPage(p=>Math.max(0,p-1));}}}><div className="reader-controls"><span>{chapter.title||"第 "+(chapter.chapter||"番外")+" 话"}</span><button onClick={()=>void (document.fullscreenElement?document.exitFullscreen():reader.current?.requestFullscreen())?.catch(()=>setError("当前浏览器未允许全屏"))}><Maximize size={17}/>{fullscreen?"退出全屏":"全屏阅读"}</button></div>{loading&&<p className="loading-text">正在读取图片…</p>}{images.length>0&&<><div className="comic-page"><ComicPageImage src={images[page]} page={page} provider={source.provider} cache={imageCache} onError={setError}/></div><div className="page-navigation"><button disabled={page===0} onClick={()=>setPage(page-1)} aria-label="上一页"><ChevronLeft/>上一页</button><span>{page+1} / {images.length}</span><button disabled={page===images.length-1} onClick={()=>setPage(page+1)} aria-label="下一页">下一页<ChevronRight/></button></div><div className="page-strip">{images.map((_,i)=><button className={page===i?"selected":""} key={i} onClick={()=>setPage(i)}>{i+1}</button>)}</div></>}{error&&<p className="playback-message" role="alert">{error}<button className="text-button" onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen().then(()=>setSourceOpen(true));else setSourceOpen(true);}}>切换分流</button></p>}</div>}
 </>}{error&&!chapter&&<p className="playback-message" role="alert">{error}</p>}
 </section>;
}
