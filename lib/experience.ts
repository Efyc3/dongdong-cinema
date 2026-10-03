import type { Work } from "./media";
export const kindNames:Record<string,string>={all:"全部",movie:"电影",tv:"电视剧",anime:"动画",manga:"漫画"};
export function artwork(w:Work){return w.backdrop||(/康斯坦丁|Constantine/i.test(w.title)&&w.year==="2005"?"/artwork/constantine-wide.jpg":w.poster);}
export type Progress={work:Work;seconds:number;duration:number;episodeLabel:string;episodeUrl:string;provider:string;updated:number};
export function readLocal<T>(key:string,fallback:T):T{try{const value=JSON.parse(localStorage.getItem("yingji."+key)||"null");return value===null?fallback:value;}catch{return fallback;}}
export function writeLocal(key:string,value:unknown){try{localStorage.setItem("yingji."+key,JSON.stringify(value));window.dispatchEvent(new Event("yingji-library"));}catch{}}
export function saveProgress(item:Progress){const entries=readLocal<Progress[]>("progress",[]);writeLocal("progress",[item,...(Array.isArray(entries)?entries:[]).filter(p=>p.work.key!==item.work.key)].slice(0,30));}

