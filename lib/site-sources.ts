import {load} from "cheerio";
import {safeUrl,text,normalizedTitle,classify,type Work,type Source,type PlayRoute,type ProviderStatus,type Kind} from "./media";
import {siteProviders} from "./site-provider-info";
import {upstreamFetch as fetch} from "./upstream-fetch";
import {anime1Search,anime1Detail,anime1Resolve} from "./anime1";
import {directMedia,publicPlayerMedia} from "./public-player";
export {directMedia} from "./public-player";
type SiteId=typeof siteProviders[number]["id"];
const origins=Object.fromEntries(siteProviders.map(p=>[p.id,p.url]));
const cache=new Map<string,{expires:number;body:string}>();
const pending=new Map<string,Promise<string>>();
async function read(provider:SiteId,path:string){
 const url=origins[provider]+path,old=cache.get(url);if(old&&old.expires>Date.now())return old.body;
 const busy=pending.get(url);if(busy)return busy;
 const task=(async()=>{let target=url,response:Response|undefined;for(let i=0;i<4;i++){response=await fetch(target,{headers:{"User-Agent":"Mozilla/5.0","Referer":origins[provider]+"/","Accept":"text/html,application/json"},signal:AbortSignal.timeout(8000),redirect:"manual"});if(![301,302,307,308].includes(response.status))break;const location=response.headers.get("location");if(!location)break;const next=new URL(location,target);const owned=provider==="skr1"?/^(?:[a-z0-9-]+\.)?skr1\.cc$/.test(next.hostname):next.origin===origins[provider];if(next.protocol!=="https:"||!owned)throw new Error("来源已迁移");target=next.href;}const r=response!;if(!r.ok)throw new Error("来源返回 "+r.status);const body=await r.text();if(body.length>3_000_000)throw new Error("来源响应过大");if(cache.size>=50)cache.delete(cache.keys().next().value!);cache.set(url,{expires:Date.now()+300_000,body});return body;})();
 pending.set(url,task);try{return await task;}finally{pending.delete(url);}
}
function image(provider:SiteId,value:string|undefined){try{return value?safeUrl(new URL(value,origins[provider]).href):"";}catch{return "";}}
function source(provider:SiteId,id:string,title:string):Source{return {provider,providerName:siteProviders.find(p=>p.id===provider)!.name,id,title,remarks:"",language:"",routes:[],subtitleHint:false,qualityHint:""};}
function work(provider:SiteId,id:string,title:string,kind:Kind,year="",poster=""):Work{return {key:kind+"|"+year+"|"+normalizedTitle(title),title,kind,year,poster,description:"",area:"",language:"",director:"",actor:"",douban:"",sources:[source(provider,id,title)]};}
function resolver(provider:SiteId,id:string,token:string,line=""){return "/api/resolve?"+new URLSearchParams({provider,id,token,...(line?{line}:{})});}
function checked(provider:string,id:string):SiteId{if(!siteProviders.some(p=>p.id===provider)||!/^\d{1,12}$/.test(id))throw new Error("无效来源或作品");return provider as SiteId;}
function ddysMeta(html:string,id:string,knownKind?:Kind):Work{
 const $=load(html),abstract=$(".abstract").first().html()||"";
 const fields=abstract.split(/<br\s*\/?\s*>/i).map(v=>text(v));
 const field=(key:string)=>fields.find(v=>v.startsWith(key+":"))?.slice(key.length+1).trim()||"";
 const title=text($(".doulist-subject .title").first().text(),200),episodes=$(".wp-playlist-item[ep_slug]").toArray().map(e=>$(e).attr("ep_slug")||"");
 const kind=knownKind||(/动画/.test(field("类型"))?"anime":episodes.some(v=>/^ep\d+$/.test(v))?"tv":"movie");
 const w=work("ddys",id,title,kind,field("年份").match(/(?:19|20)\d{2}/)?.[0]||"",image("ddys",$(".doulist-subject .post img").attr("src")));
 w.description=field("简介");w.area=field("制片国家/地区");w.actor=field("演员");w.director=field("导演");return w;
}
export async function siteSearch(query:string,kind:string,page=1){
 const statuses:ProviderStatus[]=[],works:Work[]=[];
 if(!query||page!==1||kind==="manga")return {works,statuses};
 const q=({constantine:"康斯坦丁",interstellar:"星际穿越"} as Record<string,string>)[query.toLowerCase()]||query;
 await Promise.all(siteProviders.filter(p=>kind!=="movie"&&kind!=="tv"||p.id==="ddys").map(async p=>{
  const start=Date.now();try{
   let matches:Work[]=[];
   if(p.id==="ddys"){
    const $=load(await read("ddys","/?s="+encodeURIComponent(q)+"&post_type=post"));
    const items=$("article.post-box[data-href]").toArray().map(e=>{const el=$(e),id=el.attr("data-href")?.match(/^\/vod\/(\d+)\/$/)?.[1],title=text(el.find(".post-box-image img").attr("alt"),200),k=classify(el.find(".post-box-meta").text(),title);return id&&k&&normalizedTitle(title).includes(normalizedTitle(q))&&(kind==="all"||kind===k)?{id,kind:k}:null;}).filter(v=>v!==null).slice(0,8);
    matches=(await Promise.allSettled(items.map(async v=>ddysMeta(await read("ddys","/vod/"+v.id+"/"),v.id,v.kind)))).flatMap(r=>r.status==="fulfilled"&&r.value.title?[r.value]:[]);
   }else if(p.id==="anime1"){
    matches=await anime1Search(q);
   }else if(p.id==="skr1"){
    const $=load(await read("skr1","/vodsearch/-------------/?wd="+encodeURIComponent(q)));
    $(".searchlist_item").each((_i,e)=>{const el=$(e),a=el.find("a.vodlist_thumb").first(),id=a.attr("href")?.match(/^\/voddetail\/(\d+)\/$/)?.[1],h=el.find("h4.vodlist_title a").first().clone(),category=h.find(".info_right").text();h.find(".info_right").remove();const title=text(h.text(),200),k=/日漫|国漫|美漫|番/.test(category)?"anime":classify(category,title);if(id&&k&&normalizedTitle(title).includes(normalizedTitle(q))&&(kind==="all"||kind===k))matches.push(work("skr1",id,title,k,text(el.find(".voddate_year").text()),image("skr1",a.attr("data-original"))));});
   }else{
    const pages=await Promise.allSettled([read("girigiri","/show/2-----------/"),read("girigiri","/show/2--------2---/")]);
    for(const result of pages)if(result.status==="fulfilled"){const $=load(result.value);$("a.public-list-exp[href^='/GV']").each((_i,e)=>{const a=$(e),id=a.attr("href")?.match(/^\/GV(\d+)\/$/)?.[1],title=text(a.attr("title"),200);if(id&&normalizedTitle(title).includes(normalizedTitle(q))&&!matches.some(w=>w.sources[0].id===id))matches.push(work("girigiri",id,title,"anime","",image("girigiri",a.find("img").attr("data-src"))));});}
    matches=(await Promise.allSettled(matches.slice(0,8).map(async w=>animeMeta("girigiri",await read("girigiri","/GV"+w.sources[0].id+"/"),w.sources[0].id)))).flatMap(r=>r.status==="fulfilled"?[r.value]:[]);
   }
   works.push(...matches);statuses.push({id:p.id,name:p.name,state:"ok",count:matches.length,ms:Date.now()-start});
  }catch(e){statuses.push({id:p.id,name:p.name,state:"error",count:0,ms:Date.now()-start,message:e instanceof Error?e.message:"来源暂不可用"});}
 }));return {works,statuses};
}
function animeMeta(provider:"skr1"|"girigiri",html:string,id:string):Work{
 const $=load(html);$("script,style").remove();
 const title=text($(provider==="skr1"?"h1":".detail-info .title, .detail-info h2, .detail-info h3").first().text(),200)||text($("title").text().split(/_日番|_动漫|_国番/)[0],200);
 const metadata=text($(provider==="skr1"?".data":".detail-info").text()),year=metadata.match(/(?:19|20)\d{2}/)?.[0]||"";
 const img=provider==="skr1"?$("a.vodlist_thumb").first().attr("data-original"):$(".detail-pic img").first().attr("data-src");
 const w=work(provider,id,title,"anime",year,image(provider,img));w.description=text($("meta[name=description]").attr("content"));w.area="日本";return w;
}
export async function siteDetail(providerId:string,id:string):Promise<Work>{
 const provider=checked(providerId,id);if(provider==="anime1")return anime1Detail(id);
 const path=provider==="ddys"?"/vod/"+id+"/":provider==="skr1"?"/voddetail/"+id+"/":"/GV"+id+"/";
 const html=await read(provider,path),$=load(html),w=provider==="ddys"?ddysMeta(html,id):animeMeta(provider,html,id),routes:PlayRoute[]=[];
 if(!w.title)throw new Error("作品已下架或无法读取");
 if(provider==="ddys"){
  const slugs=$(".wp-playlist-item[ep_slug]").toArray().map(e=>({token:$(e).attr("ep_slug")||"",label:text($(e).find(".wp-playlist-caption").text(),80)})).filter(v=>/^(?:ep\d+|lan_guang|hd|zheng_pian)$/.test(v.token));
  slugs.sort((a,b)=>a.token.startsWith("ep")&&b.token.startsWith("ep")?Number(a.token.slice(2))-Number(b.token.slice(2)):a.token==="zheng_pian"?-1:b.token==="zheng_pian"?1:0);
  const groups=w.kind==="tv"||slugs.some(v=>/^ep\d+$/.test(v.token))?[slugs]:slugs.map(v=>[v]);
  const names:Record<string,string>={gszy:"光速",hnzy:"红牛",jszy:"极速",xlzy:"新浪",jyzy:"金鹰",ffzy:"非凡",lzzy:"量子",wjzy2:"无尽"};
  await Promise.all(groups.map(async eps=>{if(!eps.length)return;try{const d=JSON.parse(await read(provider,"/ddrk_plays/"+id+"/"+eps[0].token));const lines=[...new Set<string>((d.video_plays||[]).filter((v:any)=>directMedia(v.play_data)&&v.src_site).map((v:any)=>String(v.src_site)))];for(const line of lines)routes.push({name:(groups.length>1?eps[0].label+" · ":"")+(names[line]||line),episodes:eps.map(e=>({label:e.label,url:resolver(provider,id,e.token,line)}))});}catch{}}));
 }else{
  const labels=provider==="skr1"?$(".play_source_tab#NumTab > a[alt]").toArray().map(e=>text($(e).attr("alt"),60)):$(".anthology-tab .swiper-wrapper > a.swiper-slide").toArray().map(e=>{const a=$(e).clone();a.find(".badge").remove();return text(a.text(),60);});
  $(provider==="skr1"?".play_list_box":".anthology-list > .anthology-list-box").each((i,e)=>{const eps:{label:string;url:string}[]=[],seen=new Set<string>();$(e).find(provider==="skr1"?"a[href^='/vodplay/']":"ul.anthology-list-play a[href^='/playGV']").each((_n,a)=>{const href=$(a).attr("href")||"",pattern=provider==="skr1"?/^\/vodplay\/(\d+)-(\d+)-(\d+)\/$/:/^\/playGV(\d+)-(\d+)-(\d+)\/$/,m=href.match(pattern);if(m&&m[1]===id&&!seen.has(href)){seen.add(href);eps.push({label:text($(a).text(),80),url:resolver(provider,id,m[2]+"-"+m[3])});}});if(eps.length)routes.push({name:labels[i]||"线路 "+(i+1),episodes:eps});});
 }
 w.sources[0].routes=routes;w.sources[0].subtitleHint=routes.some(r=>/简中|繁中/.test(r.name));return w;
}
export async function resolveEpisode(providerId:string,id:string,token:string,line=""){
 const provider=checked(providerId,id);let url="";
 if(provider==="anime1")return anime1Resolve(id,token);
 if(provider==="ddys"){
  if(!/^(?:ep\d{1,4}|lan_guang|hd|zheng_pian)$/.test(token)||! /^[a-z0-9_]{1,30}$/.test(line))throw new Error("无效播放项");
  const d=JSON.parse(await read(provider,"/ddrk_plays/"+id+"/"+token));url=(d.video_plays||[]).find((v:any)=>String(v.src_site)===line&&directMedia(v.play_data))?.play_data||"";
 }else{
  if(!/^\d{1,3}-\d{1,4}$/.test(token))throw new Error("无效集数");
  const html=await read(provider,provider==="skr1"?"/vodplay/"+id+"-"+token+"/":"/playGV"+id+"-"+token+"/");
  url=publicPlayerMedia(html,origins[provider]);
 }
 const result=directMedia(url);if(!result)throw new Error("此集暂时没有兼容的播放地址");return result;
}
