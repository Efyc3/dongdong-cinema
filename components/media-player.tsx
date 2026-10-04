"use client";
import { useEffect, useRef, useState } from "react";
import type Hls from "hls.js";
import { Maximize, Minimize, Play, Pause, SkipForward, Captions, AlertCircle, Volume2, VolumeX, RotateCcw, RotateCw, LoaderCircle, Download, FolderOpen } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadVideo, type DownloadProgress } from "@/lib/video-download";
import type { Episode } from "@/lib/media";
type Props={localVideo?:File;episode:Episode;title:string;poster?:string;autoPlay?:boolean;initialTime?:number;onNext?:()=>void;onQuality?:(max:number)=>void;onProgress?:(seconds:number,duration:number)=>void};
function stamp(value:number){if(!Number.isFinite(value))return "0:00";const s=Math.max(0,Math.floor(value));return (s>=3600?Math.floor(s/3600)+":":"")+String(Math.floor(s/60)%60).padStart(s>=3600?2:1,"0")+":"+String(s%60).padStart(2,"0");}
function forwardBuffer(el:HTMLVideoElement){for(let i=0;i<el.buffered.length;i++)if(el.currentTime>=el.buffered.start(i)-.1&&el.currentTime<=el.buffered.end(i))return Math.max(0,el.buffered.end(i)-el.currentTime);return 0;}
export default function MediaPlayer({localVideo,episode,title,poster,autoPlay=false,initialTime=0,onNext,onQuality,onProgress}:Props){
 const video=useRef<HTMLVideoElement>(null),frame=useRef<HTMLDivElement>(null),hls=useRef<Hls|null>(null),subUrl=useRef(""),hideTimer=useRef<ReturnType<typeof setTimeout>|null>(null),lastSave=useRef(0),callbacks=useRef({onProgress,onNext,onQuality});
 const bufferGoalRef=useRef(180),downloadAbort=useRef<AbortController|null>(null);
 callbacks.current={onProgress,onNext,onQuality};
 const [notice,setNotice]=useState(""),[error,setError]=useState(""),[dimensions,setDimensions]=useState(""),[levels,setLevels]=useState<{id:number;height:number;bitrate:number}[]>([]),[quality,setQuality]=useState("-1"),[tracks,setTracks]=useState<{id:number;name:string}[]>([]),[track,setTrack]=useState("-1"),[paused,setPaused]=useState(true),[visible,setVisible]=useState(true),[waiting,setWaiting]=useState(false),[time,setTime]=useState(0),[duration,setDuration]=useState(0),[volume,setVolume]=useState(1),[muted,setMuted]=useState(false),[isFull,setIsFull]=useState(false),[localName,setLocalName]=useState("");
 function wake(){setVisible(true);if(hideTimer.current)clearTimeout(hideTimer.current);hideTimer.current=setTimeout(()=>{if(video.current&&!video.current.paused&&!frame.current?.querySelector(":focus-visible"))setVisible(false);},2800);}
 const [bufferGoal,setBufferGoal]=useState(180),[buffered,setBuffered]=useState(0),[bufferMode,setBufferMode]=useState<"hls"|"native"|"local">("native"),[resolvedStream,setResolvedStream]=useState("");
 const [downloadProgress,setDownloadProgress]=useState<DownloadProgress|null>(null),[localFile,setLocalFile]=useState<{file:File;episode:string}|null>(()=>localVideo?{file:localVideo,episode:episode.url}:null);
 const isLocal=localFile?.episode===episode.url;
 useEffect(()=>{function update(){setIsFull(document.fullscreenElement===frame.current);wake();}document.addEventListener("fullscreenchange",update);return()=>{document.removeEventListener("fullscreenchange",update);if(hideTimer.current)clearTimeout(hideTimer.current);if(subUrl.current)URL.revokeObjectURL(subUrl.current);downloadAbort.current?.abort();downloadAbort.current=null;};},[]);
 useEffect(()=>{if(localFile&&localFile.episode!==episode.url)setLocalFile(null);},[episode.url,localFile]);
 useEffect(()=>{
  const el=video.current;if(!el)return;let disposed=false,restored=false,objectUrl="";const local=localFile?.episode===episode.url?localFile.file:null,controller=new AbortController();setError("");setNotice("");setLevels([]);setQuality("-1");setDimensions("");setTracks([]);setTrack("-1");setTime(0);setDuration(0);setPaused(true);setWaiting(true);setVisible(true);setLocalName("");setResolvedStream("");setBuffered(0);setBufferMode(local?"local":"native");downloadAbort.current?.abort();downloadAbort.current=null;setDownloadProgress(null);el.querySelector("track[data-local]")?.remove();if(subUrl.current){URL.revokeObjectURL(subUrl.current);subUrl.current="";}
  function verify(){if(!el)return;setDimensions(el.videoHeight?el.videoWidth+" × "+el.videoHeight:"");if(el.videoHeight)callbacks.current.onQuality?.(el.videoWidth>=3840?2160:el.videoWidth>=1920?1080:el.videoHeight);return true;}
  function metadata(){if(!el||disposed)return;const okay=verify();setDuration(Number.isFinite(el.duration)?el.duration:0);if(!local&&!restored&&initialTime>0&&Number.isFinite(el.duration)){el.currentTime=Math.min(initialTime,Math.max(0,el.duration-2));restored=true;}if(okay&&autoPlay)void el.play().catch(()=>{if(!disposed){setPaused(true);setWaiting(false);}});else setWaiting(false);}
  const saveThisEpisode=callbacks.current.onProgress;
  function save(){if(!local&&el&&el.duration>0&&el.currentTime>0)saveThisEpisode?.(el.currentTime,el.duration);}
  function updateBuffer(){if(!disposed&&el)setBuffered(forwardBuffer(el));}
  el.addEventListener("loadedmetadata",metadata);el.addEventListener("resize",verify);el.addEventListener("pause",save);el.addEventListener("progress",updateBuffer);const bufferTimer=setInterval(updateBuffer,1000);
  const load=async()=>{
   if(local){objectUrl=URL.createObjectURL(local);el.src=objectUrl;return;}
   let stream=episode.url;
   if(stream.startsWith("/api/resolve?")){const r=await fetch(stream,{signal:controller.signal});const d=await r.json() as {url?:string;error?:string};if(disposed)return;if(!r.ok||!d.url)throw new Error(d.error||"此集暂时无法播放");stream=d.url;}
   if(disposed)return;
   if(location.protocol==="https:"&&stream.startsWith("http:")){setError("这条分流无法通过安全连接播放，请切换来源。");setWaiting(false);return;}
   setResolvedStream(stream);
   if(/\.m3u8(?:[?#]|$)/i.test(stream)){
    const {default:Hls}=await import("hls.js");if(disposed)return;
    if(!Hls.isSupported()){if(el.canPlayType("application/vnd.apple.mpegurl"))el.src=stream;else{setError("当前浏览器不支持此格式，请切换分流。");setWaiting(false);}return;}
    setBufferMode("hls");const player=new Hls({enableWorker:true,maxBufferLength:bufferGoalRef.current,maxMaxBufferLength:bufferGoalRef.current,maxBufferSize:256*1024*1024,backBufferLength:30});hls.current=player;
    player.on(Hls.Events.MANIFEST_PARSED,(_event,data)=>{if(disposed)return;const choices=data.levels.map((l,i)=>({id:i,height:l.height||0,bitrate:l.bitrate||0})).sort((a,b)=>b.height-a.height||b.bitrate-a.bitrate);setLevels(choices);if(choices.length){player.currentLevel=choices[0].id;setQuality(String(choices[0].id));if(choices[0].height)callbacks.current.onQuality?.(choices[0].height);}});
    player.on(Hls.Events.SUBTITLE_TRACKS_UPDATED,(_e,data)=>{if(disposed)return;const list=data.subtitleTracks.map((s:any)=>({id:s.id,name:s.name||s.lang||"字幕"}));setTracks(list);const zh=list.find(s=>/中文|简|繁|zh|chinese/i.test(s.name));if(zh){setTrack(String(zh.id));player.subtitleTrack=zh.id;}});
    player.on(Hls.Events.ERROR,(_e,data)=>{if(!disposed&&data.fatal){setError(data.type==="networkError"?"分流暂时无法连接，请在播放器下方切换来源。":"浏览器无法解码此分流，请切换来源。");setWaiting(false);player.destroy();hls.current=null;}});
    player.loadSource(stream);player.attachMedia(el);
   }else el.src=stream;
  };
  void load().catch(e=>{if(!disposed){setError(e instanceof Error?e.message:"播放器加载失败，请切换分流后重试。");setWaiting(false);}});
  return()=>{disposed=true;controller.abort();clearInterval(bufferTimer);save();el.removeEventListener("pause",save);el.pause();el.removeEventListener("loadedmetadata",metadata);el.removeEventListener("resize",verify);el.removeEventListener("progress",updateBuffer);hls.current?.destroy();hls.current=null;el.removeAttribute("src");el.load();if(objectUrl)URL.revokeObjectURL(objectUrl);downloadAbort.current?.abort();downloadAbort.current=null;};
 },[episode.url,localFile]);
 function toggle(){const el=video.current;if(!el)return;if(error&&el.paused)return;if(el.paused)void el.play().catch(()=>setError("暂时无法开始播放，请切换分流。"));else el.pause();wake();}
 function seek(amount:number){const el=video.current;if(!el)return;el.currentTime=Math.max(0,Math.min(el.duration||0,el.currentTime+amount));setTime(el.currentTime);wake();}
 async function full(){try{if(document.fullscreenElement)await document.exitFullscreen();else await frame.current?.requestFullscreen();}catch{setNotice("当前浏览器未允许全屏。");}}
 function chooseQuality(value:string){setQuality(value);if(hls.current)hls.current.currentLevel=Number(value);wake();}
 function chooseBuffer(value:string){const seconds=Number(value);bufferGoalRef.current=seconds;setBufferGoal(seconds);if(hls.current){hls.current.config.maxBufferLength=seconds;hls.current.config.maxMaxBufferLength=seconds;}}
 async function download(){
  if(downloadAbort.current){downloadAbort.current.abort();return;}if(!resolvedStream)return;
  const controller=new AbortController();downloadAbort.current=controller;setDownloadProgress({received:0,total:0});setNotice("");
  try{await downloadVideo(resolvedStream,title+" "+episode.label,controller.signal,progress=>{if(downloadAbort.current===controller)setDownloadProgress(progress);});if(downloadAbort.current===controller)setNotice("已保存到本地");}
  catch(e){if(downloadAbort.current===controller)setNotice(e instanceof Error?e.message:"下载失败");}
  finally{if(downloadAbort.current===controller){downloadAbort.current=null;setDownloadProgress(null);}}
 }
 function openLocal(file:File|undefined){if(!file)return;if(!/\.(mp4|webm|m4v|mov)$/i.test(file.name)){setNotice("请选择视频文件");return;}setLocalFile({file,episode:episode.url});}
 async function upload(file:File|undefined){
  if(!file)return;if(file.size>2_000_000){setNotice("字幕文件过大，请选择 2 MB 以内的 SRT 或 VTT。");return;}
  let content=await file.text();if(/\.srt$/i.test(file.name))content="WEBVTT\n\n"+content.replace(/^\uFEFF/,"").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g,"$1.$2");else if(!content.trimStart().startsWith("WEBVTT")){setNotice("请选择 SRT 或 VTT 字幕。");return;}
  if(subUrl.current)URL.revokeObjectURL(subUrl.current);subUrl.current=URL.createObjectURL(new Blob([content],{type:"text/vtt"}));const el=video.current;if(!el)return;el.querySelector("track[data-local]")?.remove();const t=document.createElement("track");t.kind="subtitles";t.label=file.name;t.srclang="zh";t.src=subUrl.current;t.default=true;t.dataset.local="true";el.appendChild(t);t.addEventListener("load",()=>t.track.mode="showing");if(hls.current)hls.current.subtitleTrack=-1;setTrack("-1");setLocalName(file.name);setNotice("");
 }
 const downloadLabel=downloadProgress?"取消下载 · "+(downloadProgress.total?Math.min(100,Math.floor(downloadProgress.received/downloadProgress.total*100))+"%":Math.floor(downloadProgress.received/1024/1024)+" MB"):"下载";
 return <section className="player-section">
 <div className={"video-frame"+(!visible&&!paused&&!error?" controls-hidden":"")} ref={frame} tabIndex={0} aria-label={title+" 播放器；空格暂停，左右键快进快退，F 全屏"} onPointerMove={wake} onPointerDown={wake} onFocus={wake} onKeyDown={e=>{if((e.target as HTMLElement).closest("input,button,select"))return;if(e.key===" "||e.key==="k"){e.preventDefault();toggle();}else if(e.key==="ArrowRight"){e.preventDefault();seek(10);}else if(e.key==="ArrowLeft"){e.preventDefault();seek(-10);}else if(e.key.toLowerCase()==="f"){e.preventDefault();void full();}else if(e.key==="m"&&video.current){video.current.muted=!video.current.muted;setMuted(video.current.muted);}}}>
  <video ref={video} playsInline preload="auto" poster={poster} aria-label={isLocal&&localFile?localFile.file.name:title+" "+episode.label} onClick={toggle} onDoubleClick={()=>void full()} onPlay={()=>{setPaused(false);wake();}} onPause={()=>{setPaused(true);setVisible(true);}} onWaiting={()=>setWaiting(true)} onPlaying={()=>setWaiting(false)} onCanPlay={()=>setWaiting(false)} onDurationChange={()=>setDuration(Number.isFinite(video.current?.duration)?video.current!.duration:0)} onTimeUpdate={()=>{const el=video.current;if(!el)return;setTime(el.currentTime);setBuffered(forwardBuffer(el));if(!isLocal&&Date.now()-lastSave.current>5000&&el.duration>0){lastSave.current=Date.now();callbacks.current.onProgress?.(el.currentTime,el.duration);}}} onError={()=>{if(video.current?.getAttribute("src")&&!hls.current){setError(isLocal?"本地文件无法播放":"此分流暂时无法播放，请切换来源。");setWaiting(false);}}} onEnded={()=>{if(!isLocal&&callbacks.current.onNext)callbacks.current.onNext();}}/>
  <div className="video-controls"><div className="video-top"><div><strong>{title}</strong><span>{isLocal&&localFile?localFile.file.name:episode.label}</span></div>{isFull&&<button className="icon-button" aria-label="退出全屏" onClick={()=>void full()}><Minimize size={21}/></button>}</div>
   <div className="video-center"><button aria-label="后退 10 秒" onClick={()=>seek(-10)}><RotateCcw size={22}/></button><button className="big-play" aria-label={paused?"播放":"暂停"} onClick={toggle}>{waiting?<LoaderCircle className="spinning" size={28}/>:paused?<Play size={28} fill="currentColor"/>:<Pause size={28} fill="currentColor"/>}</button><button aria-label="前进 10 秒" onClick={()=>seek(10)}><RotateCw size={22}/></button></div>
   <div className="video-bottom"><input aria-label="播放进度" type="range" min="0" max={duration||1} step=".1" value={Math.min(time,duration||1)} onChange={e=>{const value=Number(e.target.value);if(video.current)video.current.currentTime=value;setTime(value);wake();}}/><div className="video-control-row"><div><button aria-label={paused?"播放":"暂停"} onClick={toggle}>{paused?<Play size={19} fill="currentColor"/>:<Pause size={19} fill="currentColor"/>}</button><span>{stamp(time)} / {stamp(duration)}</span>{onNext&&!isLocal&&<button aria-label="下一集" onClick={onNext}><SkipForward size={21}/></button>}</div><div>{levels.length>1&&<select className="quality-select" aria-label="画质" value={quality} onChange={e=>chooseQuality(e.target.value)}><option value="-1">自动</option>{levels.map(l=><option key={l.id} value={String(l.id)}>{l.height>=2160?"4K":l.height?l.height+"p":Math.round(l.bitrate/1000)+" kb/s"}</option>)}</select>}<button aria-label={muted?"取消静音":"静音"} onClick={()=>{if(video.current){video.current.muted=!video.current.muted;setMuted(video.current.muted);}}}>{muted?<VolumeX size={22}/>:<Volume2 size={22}/>}</button><input className="volume-slider" aria-label="音量" type="range" min="0" max="1" step=".05" value={muted?0:volume} onChange={e=>{const value=Number(e.target.value);setVolume(value);setMuted(value===0);if(video.current){video.current.volume=value;video.current.muted=value===0;}wake();}}/><button aria-label={isFull?"退出全屏":"全屏"} onClick={()=>void full()}>{isFull?<Minimize size={22}/>:<Maximize size={22}/>}</button></div></div></div>
  </div>
  {error&&<div className="video-error" role="alert"><AlertCircle size={30}/><strong>暂时无法播放</strong><p>{error}</p>{isFull&&<button className="secondary-button" onClick={()=>void full()}>退出全屏</button>}</div>}
 </div>
 <div className="player-toolbar"><div className="player-info"><Play size={14}/><strong>{isLocal?"本地视频":episode.label}</strong><span>{dimensions}</span></div><div className="player-actions">
 {!isLocal&&<button className="upload-sub" disabled={!resolvedStream} onClick={()=>void download()}><Download size={18}/>{downloadLabel}</button>}
 <label className="upload-sub"><FolderOpen size={18}/>打开本地<input type="file" accept="video/mp4,video/webm,.mp4,.webm,.m4v,.mov" aria-label="打开本地视频" onChange={e=>{openLocal(e.target.files?.[0]);e.target.value="";}}/></label>
 {isLocal&&!localVideo&&<button className="upload-sub" onClick={()=>setLocalFile(null)}>返回在线播放</button>}
 <label className="upload-sub"><Captions size={19}/>{localName?"更换字幕":"外挂字幕"}<input type="file" accept=".srt,.vtt" aria-label="上传外挂字幕" onChange={e=>{void upload(e.target.files?.[0]);e.target.value="";}}/></label></div></div>
 <div className="player-options">
 {bufferMode==="hls"&&<label className="check-label">预缓存<select className="quality-select" aria-label="视频预缓存" value={String(bufferGoal)} onChange={e=>chooseBuffer(e.target.value)}><option value="30">30 秒</option><option value="180">3 分钟</option><option value="600">10 分钟</option></select></label>}
 {!isLocal&&<span>已缓冲 {stamp(buffered)}</span>}
 {tracks.length>0&&<Select value={track} onValueChange={v=>{setTrack(v);if(hls.current)hls.current.subtitleTrack=Number(v);const t=video.current?.querySelector<HTMLTrackElement>("track[data-local]");if(t)t.track.mode=v==="-1"?"showing":"disabled";}}><SelectTrigger aria-label="字幕"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="-1">{localName?"外挂字幕":"关闭内置字幕"}</SelectItem>{tracks.map(t=><SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent></Select>}{localName&&<span>{localName}</span>}</div>
 {notice&&<p className="playback-message" role="status">{notice}</p>}
 </section>;
}

