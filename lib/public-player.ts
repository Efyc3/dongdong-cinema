import {load} from "cheerio";
import {safeUrl} from "./media";

export function directMedia(value:unknown){
 const url=safeUrl(value);if(!url||!/^https:\/\//.test(url)||! /\.(?:m3u8|mp4|webm|m4v)(?:[?#]|$)/i.test(url))return "";
 const h=new URL(url).hostname;
 if(/^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[)|\.local$/.test(h))return "";return url;
}
function jsonObject(script:string,start:number){
 while(/\s/.test(script[start]||"")&&start<script.length)start++;
 if(script[start]!=="{")return "";
 let depth=0,quote=false,escape=false;
 for(let i=start;i<Math.min(script.length,start+128_000);i++){
  const c=script[i];if(quote){if(escape)escape=false;else if(c==="\\")escape=true;else if(c==='"')quote=false;continue;}
  if(c==='"')quote=true;else if(c==="{")depth++;else if(c==="}"&&--depth===0)return script.slice(start,i+1);
 }
 return "";
}
// Read public JSON configuration and native video tags only. Upstream JavaScript
// is never executed, and paid/trial configuration is not turned into a stream.
export function publicPlayerMedia(html:string,origin:string){
 const $=load(html);let configured="";
 for(const script of $("script:not([src])").toArray()){
  const code=$(script).html()||"",pattern=/\bplayer_[A-Za-z0-9_]+\s*=\s*/g;let match:RegExpExecArray|null;
  while((match=pattern.exec(code))){
   const raw=jsonObject(code,match.index+match[0].length);if(!raw)continue;
   let p:Record<string,unknown>;try{p=JSON.parse(raw);}catch{continue;}
   if(!p||typeof p!=="object")continue;
   if(Number(p.points)>0||Number(p.trysee)>0)throw new Error("此播放项需要来源授权");
   if(typeof p.url!=="string"||p.url.length>8000)continue;
   let value=p.url;
   try{if(Number(p.encrypt)===2){if(!/^[A-Za-z0-9+/]*={0,2}$/.test(value))continue;value=Buffer.from(value,"base64").toString("utf8");}if(Number(p.encrypt)===1||Number(p.encrypt)===2)value=decodeURIComponent(value);}catch{continue;}
   try{configured=directMedia(new URL(value,origin).href)||configured;}catch{}
  }
 }
 if(configured)return configured;
 for(const node of $("video[src],video source[src]").toArray()){
  try{const value=directMedia(new URL($(node).attr("src")||"",origin).href);if(value)return value;}catch{}
 }
 throw new Error("暂无兼容的公开播放地址");
}
