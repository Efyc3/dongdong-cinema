export type Kind = "movie" | "tv" | "anime" | "manga";
export type Episode = { label: string; url: string };
export type PlayRoute = { name: string; episodes: Episode[] };
export type Source = { provider: string; providerName: string; id: string; title: string; remarks: string; language: string; routes: PlayRoute[]; subtitleHint: boolean; qualityHint: string; qualityMax?:number };
export type MangaSource = {provider:"mangadex"|"manhuagui"|"komiic"|"mangacopy";name:string;id:string;url:string;mode:"inline"|"external"};
export type Work = { key: string; title: string; year: string; kind: Kind; poster: string; description: string; area: string; language: string; director: string; actor: string; douban: string; sources: Source[]; mangaId?: string; externalUrl?: string; mangaSources?:MangaSource[]; backdrop?:string; rank?:number; rating?:number };
export function mangaSources(work:Work):MangaSource[]{
 const list=[...(work.mangaSources||[])];
 if(work.mangaId&&!list.some(s=>s.provider==="mangadex"&&s.id===work.mangaId))list.push({provider:"mangadex",name:"MangaDex",id:work.mangaId,url:"https://mangadex.org/title/"+work.mangaId,mode:"inline"});
 if(work.externalUrl&&!list.some(s=>s.url===work.externalUrl))list.push({provider:"manhuagui",name:"漫画柜",id:work.externalUrl,url:work.externalUrl,mode:"external"});
 return list;
}
export type ProviderStatus = { id: string; name: string; state: "ok" | "error"; count: number; ms: number; message?: string };
export const providers = [
 { id:"hongniu",name:"红牛资源",url:"https://www.hongniuzy3.com/api.php/provide/vod/",fallback:"http://www.hongniuzy3.com/api.php/provide/vod/" },
 { id:"zuid",name:"最大资源",url:"https://zuidazy.me/api.php/provide/vod/",fallback:"http://zuidazy.me/api.php/provide/vod/" },
 { id:"ruyi",name:"如意资源",url:"https://cj.rycjapi.com/api.php/provide/vod/",fallback:"http://cj.rycjapi.com/api.php/provide/vod/" },
 { id:"liangzi",name:"量子资源",url:"https://cj.lziapi.com/api.php/provide/vod/" },
 { id:"feifan",name:"非凡资源",url:"https://cj.ffzyapi.com/api.php/provide/vod/" },
 { id:"baofeng",name:"暴风资源",url:"https://bfzyapi.com/api.php/provide/vod/" },
 { id:"wujin",name:"无尽资源",url:"https://api.wujinapi.me/api.php/provide/vod/" },
 { id:"360",name:"360资源",url:"https://360zy.com/api.php/provide/vod/" },
] as const;
export function safeUrl(value: unknown): string {
 if (typeof value !== "string" || value.length > 4096) return "";
 try { const u = new URL(value); return ["https:","http:"].includes(u.protocol) && !u.username && !u.password ? u.href : ""; } catch { return ""; }
}
export function text(value: unknown, max=4000): string {
 return String(value ?? "").replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/g," ").replace(/&quot;/g,'"').replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim().slice(0,max);
}
export function normalizedTitle(value: string): string {
 return value.normalize("NFKC").toLowerCase().replace(/(?:[（(]?\b(?:19|20)\d{2}[)）]?)$/g,"").replace(/(?:国语版|国语|粤语版|粤语|中字|高清|完整版|未删减版|1080p|2160p|4k|蓝光版)$/gi,"").replace(/[\s\p{P}\p{S}]/gu,"");
}
export function classify(category: string, title: string): Kind | null {
 if (/解说|预告|花絮|短视频|写真|伦理|成人|综艺/.test(category+" "+title)) return null;
 if (/动漫|动画|动画片|动漫电影|动画电影/.test(category)) return "anime";
 if (/电视剧|剧集|剧场|国产剧|欧美剧|美剧|日剧|韩剧|港剧|台剧|泰剧|海外剧|短剧|连续剧|日本剧|韩国剧|香港剧|台湾剧/.test(category)) return "tv";
 if (/片|电影/.test(category)) return "movie";
 return null;
}
export function parseRoutes(from: string, raw: string): PlayRoute[] {
 const names=from.split("$$$");
 return raw.split("$$$").slice(0,20).map((group,i)=>({
   name:text(names[i] || "线路 "+(i+1),60),
   episodes:group.split("#").slice(0,1500).map(item=>{
     const at=item.indexOf("$"), url=safeUrl(at<0?item:item.slice(at+1));
     return {label:text(at<0?"正片":item.slice(0,at),80),url};
   }).filter(ep=>ep.url && /\.(?:m3u8|mp4|webm|m4v)(?:[?#]|$)/i.test(ep.url)),
 })).filter(group=>group.episodes.length>0);
}
export function normalizeVod(v: Record<string,unknown>, provider: typeof providers[number]): Work | null {
 const title=text(v.vod_name,200),kind=classify(text(v.type_name,80),title);
 if (!title || !kind) return null;
 const year=String(v.vod_year ?? "").match(/(?:19|20)\d{2}/)?.[0] || "";
 const remarks=text(v.vod_remarks,120), language=text(v.vod_lang,100);
 const id=String(v.vod_id??""); if (!/^\d+$/.test(id)) return null;
 const source: Source={provider:provider.id,providerName:provider.name,id,title,remarks,language,routes:parseRoutes(text(v.vod_play_from,3000),String(v.vod_play_url??"")),subtitleHint:/中字|中文字幕|简中|繁中|中文/.test(remarks+" "+String(v.vod_play_url??"")),qualityHint:(remarks+" "+title).match(/(?:1080p|2160p|4k|蓝光|高清|HD)/i)?.[0] || ""};
 return {key:kind+"|"+year+"|"+normalizedTitle(title),title:title.replace(/[（(]?(?:19|20)\d{2}[)）]?$/,"").trim(),year,kind,poster:safeUrl(v.vod_pic),description:text(v.vod_content),area:text(v.vod_area,100),language,director:text(v.vod_director,200),actor:text(v.vod_actor,500),douban:/^[1-9]\d{4,}$/.test(String(v.vod_douban_id))?String(v.vod_douban_id):"",sources:[source]};
}
export function mergeWorks(works: Work[]): Work[] {
 const merged: Work[]=[], byTitle=new Map<string,Work>(), byDb=new Map<string,Work>(),comicTitles=new Map<string,Work[]>();
 const authors=(w:Work)=>w.actor.split(/[,，/、;；]/).map(normalizedTitle).filter(Boolean).sort().join("|");
 for (const work of works) {
   const db=work.douban?work.kind+"|"+work.year+"|"+work.douban:"";
   const identity=work.kind==="manga"?"manga|"+work.year+"|"+normalizedTitle(work.title):work.key;
   let old=byTitle.get(identity) || (db?byDb.get(db):undefined);
   const comicTitle=work.kind==="manga"?normalizedTitle(work.title):"";
   if(!old&&comicTitle&&authors(work))old=comicTitles.get(comicTitle)?.find(w=>(!w.year||!work.year)&&authors(w)===authors(work));
   if (!old) {old={...work,sources:[...work.sources],...(work.kind==="manga"?{mangaSources:mangaSources(work)}:{})};merged.push(old);}
   else {
     for(const s of work.sources) if(!old.sources.some(p=>p.provider===s.provider && p.id===s.id))old.sources.push(s);
     if(!old.poster)old.poster=work.poster;if(!old.description)old.description=work.description;if(!old.douban)old.douban=work.douban;
     if(!old.mangaId)old.mangaId=work.mangaId;if(!old.externalUrl)old.externalUrl=work.externalUrl;
     if(work.kind==="manga")for(const s of mangaSources(work))if(!old.mangaSources?.some(p=>p.provider===s.provider&&p.id===s.id))(old.mangaSources??=[]).push(s);
   }
   byTitle.set(identity,old);if(db)byDb.set(db,old);
   if(comicTitle){const list=comicTitles.get(comicTitle)||[];if(!list.includes(old))list.push(old);comicTitles.set(comicTitle,list);}
 }
 for(const work of merged)work.sources.sort((a,b)=>providers.findIndex(p=>p.id===a.provider)-providers.findIndex(p=>p.id===b.provider));
 return merged;
}
const cache=new Map<string,{expires:number;value:unknown;bytes:number}>();
let cacheBytes=0;
export async function cachedJson(url: string, options?: RequestInit, ttl=180_000): Promise<any> {
 const key=(options?.method||"GET")+" "+url+" "+(options?.body||"");
 const old=cache.get(key);if(old && old.expires>Date.now())return old.value;
 let response;
 try{response=await fetch(url,{...options,headers:{"User-Agent":"DongdongCinema/1.0","Accept":"application/json",...options?.headers},signal:AbortSignal.timeout(10_000),redirect:"manual"});}
 catch(error){throw new Error(error instanceof Error && /timeout|abort/i.test(error.message)?"来源连接超时":"来源暂时无法连接");}
 if(!response.ok)throw new Error("来源返回 "+response.status);
 const body=await response.text();if(body.length>6_000_000)throw new Error("来源响应过大");
 let value;try{value=JSON.parse(body);}catch{throw new Error("来源暂未返回有效数据");}
 for(const [k,v] of cache)if(v.expires<=Date.now()){cache.delete(k);cacheBytes-=v.bytes;}
 if(body.length<=1_500_000){
  while(cacheBytes+body.length>8_000_000 || cache.size>=80){const k=cache.keys().next().value;if(!k)break;cacheBytes-=cache.get(k)!.bytes;cache.delete(k);}
  const previous=cache.get(key);if(previous)cacheBytes-=previous.bytes;
  cache.set(key,{expires:Date.now()+ttl,value,bytes:body.length});cacheBytes+=body.length;
 }
 return value;
}
async function providerJson(provider:typeof providers[number],params:Record<string,string>){
 const roots=[provider.url,...("fallback" in provider?[provider.fallback]:[])];
 let last:unknown;
 for(const root of roots){const url=new URL(root);for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);try{return await cachedJson(url.href);}catch(error){last=error;}}
 throw last;
}
export async function videoSearch(query: string, kind: string, browse=false, page=1) {
 const statuses: ProviderStatus[]=[], works: Work[]=[];
 const aliases:Record<string,string>={constantine:"康斯坦丁",interstellar:"星际穿越"};
 const search=aliases[query.toLowerCase()] || query;
 await Promise.all(providers.map(async provider=>{
   const start=Date.now();
   try{
     const data=await providerJson(provider,{ac:"detail",...(!browse?{wd:search}:{}),pg:String(page)});
     if(!Array.isArray(data.list))throw new Error("来源格式不匹配");
     const matches=data.list.map((v:any)=>normalizeVod(v,provider)).filter((w:Work|null):w is Work=>!!w && (kind==="all"||kind===w.kind) && (browse || normalizedTitle(w.title).includes(normalizedTitle(search))));
     works.push(...matches);statuses.push({id:provider.id,name:provider.name,state:"ok",count:matches.length,ms:Date.now()-start});
   }catch(error){statuses.push({id:provider.id,name:provider.name,state:"error",count:0,ms:Date.now()-start,message:error instanceof Error?error.message:"来源暂不可用"});}
 }));
 return {works:mergeWorks(works).sort((a,b)=>b.sources.length-a.sources.length),statuses};
}
export async function videoDetail(providerId: string, id: string): Promise<Work> {
 const provider=providers.find(p=>p.id===providerId);if(!provider || !/^\d{1,12}$/.test(id))throw new Error("无效来源或作品");
 const data=await providerJson(provider,{ac:"detail",ids:id});
 const work=normalizeVod(data.list?.find((v:any)=>String(v.vod_id)===id) || {},provider);
 if(!work)throw new Error("作品已下架或无法读取");return work;
}
export const isUUID=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function mangaCover(id:string,file:string) {return "/api/manga?op=cover&id="+encodeURIComponent(id)+"&file="+encodeURIComponent(file);}
export async function mangaSearch(query: string,browse=false,page=1) {
 const url=new URL("https://api.mangadex.org/manga");url.searchParams.set("limit","24");url.searchParams.set("offset",String((page-1)*24));url.searchParams.append("includes[]","cover_art");
 url.searchParams.append("contentRating[]","safe");url.searchParams.append("contentRating[]","suggestive");
 if(browse){url.searchParams.append("availableTranslatedLanguage[]","zh");url.searchParams.append("availableTranslatedLanguage[]","zh-hk");url.searchParams.set("order[followedCount]","desc");}else url.searchParams.set("title",query);
 const data=await cachedJson(url.href);if(!Array.isArray(data.data))throw new Error("漫画来源格式不匹配");
 return data.data.map((v:any):Work=>{
  const a=v.attributes, titles=a.altTitles || [], chinese=titles.map((t:any)=>t.zh||t["zh-hk"]).find(Boolean);
  const title=chinese||a.title.zh||a.title["zh-hk"]||a.title.en||Object.values(a.title)[0]||"未命名作品";
  const cover=v.relationships.find((r:any)=>r.type==="cover_art")?.attributes?.fileName;
  return {key:"manga|"+v.id,title:text(title,200),year:String(a.year||""),kind:"manga",poster:cover?mangaCover(v.id,cover):"",description:text(a.description.zh||a.description["zh-hk"]||a.description.en||"",2000),area:a.originalLanguage||"",language:(a.availableTranslatedLanguages||[]).join(", "),director:"",actor:"",douban:"",mangaId:v.id,sources:[]};
 });
}
const comicHtmlCache=new Map<string,{expires:number;works:Work[]}>();
export async function manhuaguiSearch(query:string,page=1):Promise<Work[]>{
 if(!query||page!==1)return [];
 const old=comicHtmlCache.get(query);if(old&&old.expires>Date.now())return old.works;
 const response=await fetch("https://www.manhuagui.com/s/"+encodeURIComponent(query)+".html",{headers:{"User-Agent":"DongdongCinema/1.0","Accept":"text/html"},signal:AbortSignal.timeout(10_000),redirect:"manual"});
 if(!response.ok)throw new Error("漫画柜暂不可用");
 const html=await response.text();if(html.length>3_000_000)throw new Error("来源响应过大");
 const region=html.slice(html.indexOf("book-result")),works:Work[]=[];
 for(const match of region.matchAll(/<li class="cf">([\s\S]*?)<\/li>/g)){
  const block=match[1],head=block.match(/<dt>\s*<a[^>]*href="(\/comic\/\d+\/)"[^>]*>([\s\S]*?)<\/a>/),cover=block.match(/<img[^>]*src="([^"]+)"/)?.[1];
  if(!head)continue;const title=text(head[2],200);if(/小说/.test(title))continue;
  const year=block.match(/href="\/list\/((?:19|20)\d{2})\/"/)?.[1]||"";
  const area=text(block.match(/<a[^>]*title="([^"]*漫画)"[^>]*href="\/list\//)?.[1]||"",80);
  works.push({key:"manga|"+year+"|"+normalizedTitle(title),title,year,kind:"manga",poster:cover?safeUrl(new URL(cover,"https://www.manhuagui.com").href):"",description:text(block.match(/<dd class="intro">([\s\S]*?)<\/dd>/)?.[1]||"",2000).replace(/^简介：/,""),area,language:"中文",director:"",actor:"",douban:"",sources:[],externalUrl:"https://www.manhuagui.com"+head[1]});
 }
 if(comicHtmlCache.size>=20)comicHtmlCache.delete(comicHtmlCache.keys().next().value!);
 comicHtmlCache.set(query,{expires:Date.now()+300_000,works});return works;
}
