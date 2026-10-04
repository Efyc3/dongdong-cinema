import {isUUID,normalizedTitle,safeUrl,text,type Work,type ProviderStatus} from "./media";
import {upstreamFetch} from "./upstream-fetch";
import {copySlug,copyPublicImageUrl,copyPublicCover,copyPublicChapters,copyPublicPages} from "./copymanga";
const cache=new Map<string,{until:number;value:any}>();
async function read(url:string,body?:unknown){
 const key=url+JSON.stringify(body??null),old=cache.get(key);if(old&&old.until>Date.now())return old.value;
 const r=await upstreamFetch(url,{method:body?"POST":"GET",headers:{"Accept":body?"application/json":"*/*","Content-Type":body?"application/json":"text/plain","User-Agent":"Mozilla/5.0","Referer":new URL(url).origin+"/"},...(body?{body:JSON.stringify(body)}:{}),redirect:"manual",signal:AbortSignal.timeout(12_000)});
 if(!r.ok)throw new Error("漫画来源暂不可用 ("+r.status+")");const value=await r.text();if(value.length>4_000_000)throw new Error("来源响应过大");
 if(cache.size>=40)cache.delete(cache.keys().next().value!);cache.set(key,{until:Date.now()+180_000,value});return value;
}
async function json(url:string,body?:unknown){try{return JSON.parse(await read(url,body));}catch(e){if(e instanceof SyntaxError)throw new Error("来源暂未返回有效数据");throw e;}}
async function komiic(operationName:string,query:string,variables:unknown){
 const d=await json("https://komiic.com/api/query",{operationName,query,variables});if(d.errors?.length)throw new Error("Komiic 暂时无法读取");return d.data;
}
const comicId=(id:string)=>/^\d{1,12}$/.test(id);
const copyId=copySlug;
function comicWork(provider:"komiic"|"mangacopy",v:any):Work|null{
 const id=String(provider==="komiic"?v.id:v.path_word||""),title=text(provider==="komiic"?v.title:v.name,200);
 if(!title||!(provider==="komiic"?comicId(id):copyId(id)))return null;
 const year=provider==="komiic"?String(v.year||""):"",url=provider==="komiic"?"https://komiic.com/comic/"+id:"https://mangacopy.com/comic/"+id;
 return {key:"manga|"+year+"|"+normalizedTitle(title),title,year,kind:"manga",poster:"/api/manga?provider="+provider+"&op=cover&id="+encodeURIComponent(id),description:text(v.description||"",2000),area:"",language:"中文",director:"",actor:(v.authors||v.author||[]).map((a:any)=>text(a.name,80)).join(" / "),douban:"",sources:[],mangaSources:[{provider,name:provider==="komiic"?"Komiic":"拷贝漫画",id,url,mode:"inline"}]};
}
export async function comicSearch(q:string,page:number){
 const providers=[{id:"komiic",name:"Komiic"},{id:"mangacopy",name:"拷贝漫画"}];const works:Work[]=[],statuses:ProviderStatus[]=[];
 await Promise.all(providers.map(async p=>{const start=Date.now();try{
  let rows:any[]=[];
  if(q&&p.id==="komiic"&&page===1){const d=await komiic("searchComicAndAuthorQuery","query searchComicAndAuthorQuery($keyword: String!) { searchComicsAndAuthors(keyword: $keyword) { comics { id title year imageUrl authors { id name } } } }",{keyword:q});rows=d.searchComicsAndAuthors?.comics||[];}
  if(q&&p.id==="mangacopy"){const u=new URL("https://mangacopy.com/api/kb/web/searchcl/comics");u.search=new URLSearchParams({offset:String((page-1)*24),platform:"2",limit:"24",q,q_type:""}).toString();const d=await json(u.href);if(d.code!==200)throw new Error("拷贝漫画暂不可用");rows=d.results?.list||[];}
  const found=rows.map(v=>comicWork(p.id as "komiic"|"mangacopy",v)).filter((w):w is Work=>!!w);works.push(...found);statuses.push({id:p.id,name:p.name,state:"ok",count:found.length,ms:Date.now()-start});
 }catch(e){statuses.push({id:p.id,name:p.name,state:"error",count:0,ms:Date.now()-start,message:e instanceof Error?e.message:"漫画来源暂不可用"});}}));
 // Keep the selected work and its saved key stable regardless of response order.
 works.sort((a,b)=>(a.mangaSources?.[0]?.provider==="komiic"?0:1)-(b.mangaSources?.[0]?.provider==="komiic"?0:1));
 statuses.sort((a,b)=>providers.findIndex(p=>p.id===a.id)-providers.findIndex(p=>p.id===b.id));return {works,statuses};
}
export async function comicCover(provider:string,id:string){
 if(provider==="komiic"&&comicId(id)){const d=await komiic("comicById","query comicById($comicId: ID!) { comicById(comicId: $comicId) { imageUrl } }",{comicId:id});const url=safeUrl(d.comicById?.imageUrl);if(new URL(url).hostname!=="public.komiic.com")throw new Error("无效封面");return url;}
 if(provider==="mangacopy"&&copyId(id))return copyPublicCover(id);
 throw new Error("无效漫画");
}
export async function comicChapters(provider:string,id:string){
 if(provider==="mangacopy")return copyPublicChapters(id);
 if(provider==="komiic"&&comicId(id)){
  const d=await komiic("chapterByComicId","query chapterByComicId($comicId: ID!) { chaptersByComicId(comicId: $comicId) { id serial type size } }",{comicId:id});
  const chapters=(d.chaptersByComicId||[]).filter((c:any)=>comicId(String(c.id))).map((c:any)=>({id:String(c.id),chapter:String(c.serial||""),volume:(c.type==="book"||c.type==="volume")?String(c.serial):"",title:"第 "+c.serial+((c.type==="book"||c.type==="volume")?" 卷":" 话"),pages:Number(c.size)||0,lang:"zh-hk",groups:"",externalUrl:""}));
  return {chapters,total:chapters.length,limit:chapters.length};
 }
 throw new Error("无效漫画");
}
export async function comicPages(provider:string,id:string,comic:string):Promise<string[]>{
 if(provider==="mangacopy")return copyPublicPages(comic,id);
 if(provider==="komiic"&&comicId(id)){
  const d=await komiic("imagesByChapterId","query imagesByChapterId($chapterId: ID!) { imagesByChapterId(chapterId: $chapterId) { kid } }",{chapterId:id});
  const images=(d.imagesByChapterId||[]).map((v:any)=>String(v.kid||"")).filter(isUUID).map((kid:string)=>"https://komiic.com/api/image/"+kid);
  if(!images.length)throw new Error("章节暂无图片");return images;
 }
 throw new Error("无效章节");
}
export const copyImageUrl=copyPublicImageUrl;
