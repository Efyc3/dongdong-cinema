import snapshot from "./hot-snapshot.json";
import {normalizedTitle,text,type Work,type Kind} from "./media";
export type Discover={updatedAt:string;movie:Work[];tv:Work[];anime:Work[]};
const ids={movie:"movie_hot_gaia",tv:"tv_hot",anime:"tv_animation"};
let cached:Discover=snapshot as Discover,expires=0;
const assetMap=new Map([...snapshot.movie,...snapshot.tv,...snapshot.anime].map(w=>[w.douban,{backdrop:w.backdrop,poster:w.poster}]));
export function imageUrl(value:string){if(!value)return "";return "/api/art?url="+encodeURIComponent(value.replace(/\/(?:m_ratio_poster|s_ratio_poster|m)\//,"/raw/"));}
export function normalizeHot(v:any,kind:Kind,i:number):Work{
 const meta=String(v.card_subtitle||"").split(" / "),title=text(v.title,200).replace(/[\u200e\u200f\u202a-\u202e]/g,""),year=String(v.year||meta[0]||"");
 const asset=assetMap.get(String(v.id));
 return {key:kind+"|"+year+"|"+normalizedTitle(title),title,year,kind,poster:asset?.poster||imageUrl(v.cover?.url||v.pic?.large||v.pic?.normal||""),backdrop:asset?.backdrop||"",description:text(v.comment||v.description||"",2000),area:meta[1]||v.info?.split(" / ")[0]||"",language:"",director:v.directors?.join(" / ")||meta[3]||"",actor:v.actors?.join(" / ")||meta[4]||"",douban:String(v.id),rating:v.rating?.value||0,rank:i+1,sources:[]};
}
export async function discover():Promise<Discover>{
 if(expires>Date.now())return cached;
 const result=await Promise.allSettled(Object.entries(ids).map(async([kind,id])=>{
  const r=await fetch("https://m.douban.com/rexxar/api/v2/subject_collection/"+id+"/items?start=0&count=24",{headers:{"Referer":"https://m.douban.com/tv/","User-Agent":"Mozilla/5.0","Accept":"application/json"},signal:AbortSignal.timeout(6500)});
  if(!r.ok)throw new Error("热门榜暂不可用");const d=await r.json() as any;
  if(!Array.isArray(d.subject_collection_items)||!d.subject_collection_items.length)throw new Error("空榜单");
  return {kind,works:d.subject_collection_items.map((v:any,i:number)=>normalizeHot(v,kind as Kind,i))};
 }));
 const next={...cached};let refreshed=false;
 result.forEach(r=>{if(r.status==="fulfilled"){next[r.value.kind as keyof typeof ids]=r.value.works;refreshed=true;}});
 if(refreshed)next.updatedAt=new Date().toISOString();cached=next;expires=Date.now()+600_000;return cached;
}
export function improveArtwork(works:Work[]){
 const all=[...cached.movie,...cached.tv,...cached.anime];
 return works.map(w=>{const match=all.find(h=>h.kind===w.kind&&(h.douban===w.douban&&!!w.douban||normalizedTitle(h.title)===normalizedTitle(w.title)&&h.year===w.year));return match?{...w,poster:match.poster,backdrop:match.backdrop||w.backdrop}:w.kind==="movie"&&w.year==="2005"&&normalizedTitle(w.title)==="康斯坦丁"?{...w,poster:"/artwork/constantine-poster.jpg",backdrop:"/artwork/constantine-wide.jpg"}:w;});
}

