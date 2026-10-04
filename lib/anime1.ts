import {randomBytes} from "node:crypto";
import {load} from "cheerio";
import {normalizedTitle,text,type Work,type Source} from "./media";
import {upstreamFetch} from "./upstream-fetch";

const ORIGIN="https://anime1.me",API="https://v.anime1.me/api";
type Session={url:string;cookie:string;expires:number;post:string;catalog:string;active:number};
type State={sessions:Map<string,Session>;pending:Map<string,Promise<string>>;catalog?:{expires:number;rows:unknown[][]};active:number;blockedUntil:number};
const shared=globalThis as typeof globalThis&{__dongdongAnime1?:State};
const state:State=shared.__dongdongAnime1??={sessions:new Map(),pending:new Map(),active:0,blockedUntil:0};

function validId(id:string){return /^[1-9]\d{0,8}$/.test(id);}
function unavailable(status:number){if(status===429)state.blockedUntil=Date.now()+60_000;return new Error(status===401||status===402||status===403?"此来源暂不允许播放":status===429?"此来源请求过多，请稍后重试":"来源返回 "+status);}
async function bodyText(response:Response,limit:number){
 if(!response.body)throw new Error("来源响应为空");
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>limit)throw new Error("来源响应过大");chunks.push(item.value);}return Buffer.concat(chunks).toString("utf8");}
 catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
}
async function readPage(path:string,signal:AbortSignal){
 if(state.blockedUntil>Date.now())throw new Error("此来源请求过多，请稍后重试");
 const response=await upstreamFetch(ORIGIN+path,{signal,redirect:"manual",headers:{Accept:"text/html,application/json"}});
 if(!response.ok){void response.body?.cancel();throw unavailable(response.status);}
 return bodyText(response,2_000_000);
}
async function catalog(){
 if(state.catalog&&state.catalog.expires>Date.now())return state.catalog.rows;
 const rows=JSON.parse(await readPage("/animelist.json",AbortSignal.timeout(8000)));
 if(!Array.isArray(rows))throw new Error("来源目录格式已变化");
 const filtered=rows.slice(0,6000).filter((row):row is unknown[]=>Array.isArray(row)&&validId(String(row[0]))&&typeof row[1]==="string");
 state.catalog={expires:Date.now()+300_000,rows:filtered};return filtered;
}
function fromRow(row:unknown[]):Work{
 const id=String(row[0]),title=text(row[1],200),year=String(row[3]??"").match(/(?:19|20)\d{2}/)?.[0]||"";
 const source:Source={provider:"anime1",providerName:"Anime1",id,title,remarks:text(row[2],80),language:"",routes:[],subtitleHint:true,qualityHint:""};
 return {key:"anime|"+year+"|"+normalizedTitle(title),title,kind:"anime",year,poster:"",description:"",area:"日本",language:"",director:"",actor:"",douban:"",sources:[source]};
}
export async function anime1Search(query:string){
 const q=normalizedTitle(query);return (await catalog()).filter(row=>normalizedTitle(String(row[1])).includes(q)).slice(0,12).map(fromRow);
}
export async function anime1Detail(id:string):Promise<Work>{
 if(!validId(id))throw new Error("无效作品");
 const row=(await catalog()).find(row=>String(row[0])===id);if(!row)throw new Error("作品已下架");
 const work=fromRow(row),episodes=new Map<string,{label:string;url:string}>(),signal=AbortSignal.timeout(15_000);
 // The public archive is paginated. Follow only its own older-page link, with a
 // bounded number of ordinary requests; private WordPress endpoints are unused.
 let path="/?cat="+id,remaining="";
 for(let page=0;page<20;page++){
  let html:string;try{html=await readPage(path,signal);}catch(e){if(!episodes.size)throw e;remaining=path;break;}
  const $=load(html);
  $("article.post").each((_i,el)=>{
   const article=$(el),a=article.find(".entry-title a").first();let url:URL;
   try{url=new URL(a.attr("href")||"",ORIGIN);}catch{return;}
   const post=url.pathname.match(/^\/([1-9]\d{0,8})\/?$/)?.[1];
   const ticket=article.find("video[data-apireq]").first().attr("data-apireq");
   if(url.origin!==ORIGIN||!post||!ticket)return;
   try{const data=JSON.parse(decodeURIComponent(ticket));if(String(data.c)!==id||Number(data.p)>0)return;}catch{return;}
   const title=text(a.text(),200),number=title.match(/\[([^\]]+)\]\s*$/)?.[1];
   episodes.set(post,{label:number?/^\d+$/.test(number)?"第 "+number+" 集":number:title,url:"/api/resolve?"+new URLSearchParams({provider:"anime1",id,token:post})});
  });
  const next=$(".nav-previous a").first().attr("href");remaining="";if(!next)break;
  const target=new URL(next,ORIGIN);
  if(target.origin!==ORIGIN||!/^\/page\/[1-9]\d?\/?$/.test(target.pathname)||target.searchParams.get("cat")!==id)break;
  remaining=target.pathname+target.search;path=remaining;
 }
 const ordered=[...episodes.entries()].sort((a,b)=>Number(a[0])-Number(b[0])).map(([,ep])=>ep);
 work.sources[0].routes=ordered.length?[{name:"繁中",episodes:ordered}]:[];
 if(remaining)work.sources[0].remarks="最近 "+ordered.length+" 集";
 return work;
}
function mediaUrl(raw:unknown){
 if(typeof raw!=="string"||raw.length>2000)throw new Error("来源播放地址无效");
 const url=new URL(raw,"https://v.anime1.me");
 if(url.protocol!=="https:"||url.port||url.username||url.password||! /^[a-z0-9-]+\.v\.anime1\.me$/.test(url.hostname)||!/^\/[1-9]\d{0,8}\/[a-zA-Z0-9_-]{1,50}\.mp4$/.test(url.pathname))throw new Error("来源播放地址不兼容");
 return url;
}
function cookieHeader(response:Response,url:URL){
 const values=new Map<string,string>();let expires=Date.now()+3_600_000;
 for(const entry of response.headers.getSetCookie()){
  const parts=entry.split(";"),match=parts[0].trim().match(/^(e|p|h)=([A-Za-z0-9_+/=-]{1,2048})$/);if(!match)continue;
  const attr=new Map(parts.slice(1).map(p=>{const i=p.indexOf("=");return [p.slice(0,i<0?undefined:i).trim().toLowerCase(),i<0?"":p.slice(i+1).trim()];}));
  if(attr.get("domain")?.replace(/^\./,"")!=="v.anime1.me"||attr.get("path")!==url.pathname||!attr.has("secure"))continue;
  if(attr.has("max-age")){const age=Number(attr.get("max-age"));if(!Number.isFinite(age)||age<=0)continue;expires=Math.min(expires,Date.now()+age*1000);}
  if(attr.has("expires")){const until=Date.parse(attr.get("expires")!);if(Number.isFinite(until))expires=Math.min(expires,until);}
  values.set(match[1],match[1]+"="+match[2]);
 }
 if(values.size!==3||expires<=Date.now())throw new Error("来源未授予公开播放会话");
 return {cookie:[...values.values()].join("; "),expires};
}
function prune(){for(const [key,value]of state.sessions)if(value.expires<=Date.now()&&value.active===0)state.sessions.delete(key);}
export async function anime1Resolve(id:string,post:string){
 if(!validId(id)||!validId(post))throw new Error("无效播放项");prune();
 for(const [token,session]of state.sessions)if(session.catalog===id&&session.post===post&&session.expires>Date.now()+30_000)return "/api/anime1-stream/"+token+".mp4";
 const key=id+"|"+post,busy=state.pending.get(key);if(busy)return busy;
 const task=(async()=>{
  if(state.sessions.size+state.pending.size>=64)throw new Error("播放会话较多，请稍后重试");
  const html=await readPage("/"+post,AbortSignal.timeout(8000)),$=load(html),ticket=$("video[data-apireq]").first().attr("data-apireq");
  if(!ticket||ticket.length>3000)throw new Error("暂无公开的播放地址");
  const payload=JSON.parse(decodeURIComponent(ticket));if(String(payload.c)!==id||Number(payload.p)>0)throw new Error("此播放项需要来源授权");
  const response=await upstreamFetch(API,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},body:"d="+ticket,signal:AbortSignal.timeout(8000),redirect:"manual"});
  if(!response.ok){void response.body?.cancel();throw unavailable(response.status);}
  const data=JSON.parse(await bodyText(response,32_000));if(data.error||!Array.isArray(data.s))throw new Error("来源未提供公开播放地址");
  const url=mediaUrl(data.s.find((s:{type?:string})=>s?.type==="video/mp4")?.src),grant=cookieHeader(response,url),token=randomBytes(32).toString("hex");
  state.sessions.set(token,{url:url.href,...grant,post,catalog:id,active:0});return "/api/anime1-stream/"+token+".mp4";
 })();state.pending.set(key,task);try{return await task;}finally{state.pending.delete(key);}
}
export async function anime1Stream(token:string,request:Request):Promise<Response>{
 if(!/^[a-f0-9]{64}\.mp4$/.test(token))return new Response("无效播放会话",{status:400});
 const key=token.slice(0,-4),session=state.sessions.get(key);
 if(!session||session.expires<=Date.now())return new Response("播放会话已过期，请重新打开此集",{status:410,headers:{"Cache-Control":"no-store"}});
 if(state.blockedUntil>Date.now()||state.active>=16||session.active>=3)return new Response("请求过多，请稍后重试",{status:429,headers:{"Retry-After":"60","Cache-Control":"no-store"}});
 const range=request.headers.get("range");if(range&&!/^bytes=(?:\d{1,14}-\d{0,14}|-\d{1,14})$/.test(range))return new Response("无效播放范围",{status:416});
 const controller=new AbortController();const abort=()=>{controller.abort();release();};request.signal.addEventListener("abort",abort,{once:true});if(request.signal.aborted)controller.abort();
 const timer=setTimeout(abort,10_000);state.active++;session.active++;let released=false;
 const release=()=>{if(released)return;released=true;clearTimeout(timer);request.signal.removeEventListener("abort",abort);state.active--;session.active--;};
 try{
  const response=await upstreamFetch(session.url,{method:request.method==="HEAD"?"HEAD":"GET",headers:{Cookie:session.cookie,...(range?{Range:range}:{})},signal:controller.signal,redirect:"manual"});clearTimeout(timer);
  if(!response.ok){void response.body?.cancel();if([401,402,403].includes(response.status))state.sessions.delete(key);if(response.status===429)state.blockedUntil=Date.now()+60_000;release();return new Response("来源暂时无法播放",{status:[401,402,403,416,429].includes(response.status)?response.status:502,headers:{"Cache-Control":"no-store"}});}
  if(![200,206].includes(response.status)||! /^video\/mp4(?:;|$)/i.test(response.headers.get("content-type")||"")){void response.body?.cancel();release();return new Response("来源视频格式不兼容",{status:502});}
  const headers=new Headers({"Content-Type":"video/mp4","Cache-Control":"private, no-store, no-transform","X-Content-Type-Options":"nosniff"});
  for(const name of ["Content-Length","Content-Range","Accept-Ranges"])if(response.headers.has(name))headers.set(name,response.headers.get(name)!);
  if(request.method==="HEAD"||!response.body){void response.body?.cancel();release();return new Response(null,{status:response.status,headers});}
  const reader=response.body.getReader();let stopped=false;
  const body=new ReadableStream<Uint8Array>({async pull(target){
   let idleTimer:ReturnType<typeof setTimeout>|undefined;
   try{
    const item=await Promise.race([reader.read(),new Promise<never>((_resolve,reject)=>{idleTimer=setTimeout(()=>reject(new Error("来源视频响应超时")),20_000);})]);
    if(stopped)return;
    if(item.done){stopped=true;release();reader.releaseLock();target.close();}else target.enqueue(item.value);
   }catch(e){
    if(stopped)return;stopped=true;controller.abort();release();await reader.cancel(e).catch(()=>{});reader.releaseLock();target.error(e);
   }finally{if(idleTimer)clearTimeout(idleTimer);}
  },async cancel(reason){stopped=true;controller.abort();release();await reader.cancel(reason).catch(()=>{});reader.releaseLock();}});
  return new Response(body,{status:response.status,headers});
 }catch(e){release();return new Response(e instanceof Error&&e.name==="AbortError"?"播放请求已取消":"来源连接超时",{status:502,headers:{"Cache-Control":"no-store"}});}
}
