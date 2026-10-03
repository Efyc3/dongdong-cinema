import {videoDetail,type PlayRoute} from "./media";
import {siteProviders} from "./site-provider-info";
import {siteDetail,resolveEpisode,directMedia} from "./site-sources";
import {upstreamFetch as fetch} from "./upstream-fetch";
const cache=new Map<string,{height:number;expires:number}>();
export function manifestHeight(manifest:string){return Math.max(0,...[...manifest.matchAll(/RESOLUTION=(\d+)x(\d+)/gi)].map(v=>Number(v[2])));}
async function height(route:PlayRoute){
 try{let url=route.episodes[0]?.url||"";if(url.startsWith("/api/resolve?")){const p=new URL(url,"https://local.invalid").searchParams;url=await resolveEpisode(p.get("provider")||"",p.get("id")||"",p.get("token")||"",p.get("line")||"");}
  url=directMedia(url);if(!url||! /\.m3u8(?:[?#]|$)/i.test(url))return 0;
  const r=await fetch(url,{signal:AbortSignal.timeout(6500),redirect:"manual"});if(!r.ok)return 0;const body=await r.text();if(body.length>1_000_000||!body.trimStart().startsWith("#EXTM3U"))return 0;return manifestHeight(body);
 }catch{return 0;}
}
export async function sourceQuality(provider:string,id:string){
 const key=provider+":"+id,old=cache.get(key);if(old&&old.expires>Date.now())return old.height;
 const w=await (siteProviders.some(p=>p.id===provider)?siteDetail(provider,id):videoDetail(provider,id)),routes=[...(w.sources[0]?.routes||[])];
 const heights:number[]=[];
 await Promise.all(Array.from({length:Math.min(3,routes.length)},async()=>{while(routes.length){const r=routes.shift()!;heights.push(await height(r));}}));
 const qualityMax=Math.max(0,...heights);if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(key,{height:qualityMax,expires:Date.now()+(qualityMax?300_000:30_000)});return qualityMax;
}
