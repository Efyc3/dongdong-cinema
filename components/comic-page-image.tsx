"use client";
import {useEffect,useState,type MutableRefObject} from "react";
export default function ComicPageImage({src,page,provider,cache,onError}:{src:string;page:number;provider:string;cache:MutableRefObject<Map<string,string>>;onError:(value:string)=>void}){
 const [image,setImage]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{
  setImage("");if(provider!=="komiic"){setImage(src);setBusy(false);return;}
  const cached=cache.current.get(src);if(cached){setImage(cached);setBusy(false);return;}
  const abort=new AbortController(),signal=AbortSignal.any([abort.signal,AbortSignal.timeout(20_000)]);setBusy(true);
  void (async()=>{
   const kid=src.match(/^https:\/\/komiic\.com\/api\/image\/([a-f0-9-]{36})$/i)?.[1];if(!kid)throw new Error("无效图片");
   const r=await fetch("https://komiic.com/api/query",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operationName:"getImageTicket",query:"query getImageTicket($kid: String!) { getImageTicket(kid: $kid) { url ticket kid } }",variables:{kid}}),signal,credentials:"omit"});
   if(r.status===402)throw new Error("Komiic 今日图片额度已用完");
   let data:any;try{data=await r.json();}catch{throw new Error("Komiic 图片暂不可用");}
   if(data.errors?.some((e:any)=>e.extensions?.code==="QUOTA_EXCEEDED"||/quota|额度/i.test(e.message)))throw new Error("Komiic 今日图片额度已用完");
   const ticket=data.data?.getImageTicket;if(!r.ok||!ticket)throw new Error("Komiic 图片暂不可用");
   const url=new URL(ticket.url);if(url.protocol!=="https:"||url.hostname!=="img.komiic.com"||url.username||url.password)throw new Error("无效图片");
   const response=await fetch(url,{headers:{"X-Image-Ticket":ticket.ticket},signal,credentials:"omit",redirect:"error"});
   if(response.status===402)throw new Error("Komiic 今日图片额度已用完");if(!response.ok)throw new Error("Komiic 图片暂不可用");
   const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>16_000_000)throw new Error("图片过大");
   const type=bytes[0]===255&&bytes[1]===216?"image/jpeg":bytes[0]===137&&bytes[1]===80?"image/png":String.fromCharCode(...bytes.slice(8,12))==="WEBP"?"image/webp":"";
   if(!type)throw new Error("未收到有效图片");if(abort.signal.aborted)return;
   while(cache.current.size>=6){const key=cache.current.keys().next().value!;URL.revokeObjectURL(cache.current.get(key)!);cache.current.delete(key);}
   const local=URL.createObjectURL(new Blob([bytes],{type}));cache.current.set(src,local);setImage(local);onError("");
  })().catch(e=>{if(!abort.signal.aborted)onError(e instanceof TypeError||e?.name==="TimeoutError"?"Komiic 图片暂不可用":e instanceof Error?e.message:"图片暂不可用");}).finally(()=>{if(!abort.signal.aborted)setBusy(false);});
  return()=>abort.abort();
 },[src,provider]);
 return <>{busy&&<p className="loading-text">正在读取图片…</p>}{image&&<img src={image} alt={"第 "+(page+1)+" 页"} onLoad={()=>onError("")} onError={()=>onError("这一页暂时无法读取，请换一个分流。")}/>}</>;
}
