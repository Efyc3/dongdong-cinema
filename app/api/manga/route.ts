import { cachedJson, isUUID, safeUrl } from "@/lib/media";
import {comicCover,comicChapters,comicPages} from "@/lib/comic-sources";
import {upstreamFetch} from "@/lib/upstream-fetch";
import {CopyMangaError,copyPublicPageImage} from "@/lib/copymanga";
const ua={"User-Agent":"DongdongCinema/1.0"};
export async function GET(request:Request){
 const u=new URL(request.url),op=u.searchParams.get("op"),id=u.searchParams.get("id")||"",provider=u.searchParams.get("provider")||"mangadex";
 if(provider==="komiic"||provider==="mangacopy"){
  try{
   if(op==="cover")return await imageResponse(await comicCover(provider,id));
   if(op==="chapters")return Response.json(await comicChapters(provider,id));
   if(op==="pages"){
    const images=await comicPages(provider,id,u.searchParams.get("comic")||"");
    return Response.json({pages:images.length,images});
   }
   if(op==="image"&&provider==="mangacopy")return await imageResponse(await copyPublicPageImage(u.searchParams.get("comic")||"",id,Number(u.searchParams.get("page"))),request.signal);
   return Response.json({error:"无效请求"},{status:400});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"漫画来源暂不可用"},{status:error instanceof CopyMangaError?error.status:502});}
 }
 if(provider!=="mangadex")return Response.json({error:"无效来源"},{status:400});
 if(!isUUID(id))return Response.json({error:"无效作品或章节"},{status:400});
 try {
  if(op==="cover"){
   const file=u.searchParams.get("file")||"";if(!/^[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i.test(file))return Response.json({error:"无效封面"},{status:400});
   return await imageResponse("https://uploads.mangadex.org/covers/"+id+"/"+file+".256.jpg");
  }
  if(op==="chapters"){
   const url=new URL("https://api.mangadex.org/manga/"+id+"/feed");url.searchParams.set("limit","100");url.searchParams.set("offset",String(Math.max(0,Math.min(10000,Number(u.searchParams.get("offset"))||0))));
   url.searchParams.set("order[chapter]","asc");url.searchParams.append("includes[]","scanlation_group");
   if(u.searchParams.get("lang")!=="all"){url.searchParams.append("translatedLanguage[]","zh");url.searchParams.append("translatedLanguage[]","zh-hk");}
   const data=await cachedJson(url.href);
   return Response.json({total:data.total,offset:data.offset,limit:data.limit,chapters:(data.data||[]).filter((v:any)=>!v.attributes.isUnavailable && v.attributes.pages>0).map((v:any)=>({id:v.id,chapter:v.attributes.chapter,volume:v.attributes.volume,title:v.attributes.title,pages:v.attributes.pages,lang:v.attributes.translatedLanguage,externalUrl:safeUrl(v.attributes.externalUrl),groups:v.relationships.filter((r:any)=>r.type==="scanlation_group").map((r:any)=>r.attributes?.name||"未署名").join(" / ")}))});
  }
  if(op==="pages"||op==="image"){
   const data=await cachedJson("https://api.mangadex.org/at-home/server/"+id,undefined,60_000);
   if(!data.chapter?.data?.length)throw new Error("章节暂无可读图片");
   if(op==="pages")return Response.json({pages:data.chapter.data.length,images:data.chapter.data.map((_:unknown,i:number)=>"/api/manga?op=image&id="+id+"&page="+i)});
   const page=Number(u.searchParams.get("page"));if(!Number.isInteger(page)||page<0||page>=data.chapter.data.length)return Response.json({error:"无效页码"},{status:400});
   const base=new URL(data.baseUrl);if(base.protocol!=="https:"||!(base.hostname.endsWith(".mangadex.network")||base.hostname.endsWith(".mangadex.org")||base.hostname==="mangadex.org"))throw new Error("图片服务器暂不支持");
   return await imageResponse(base.origin+"/data/"+encodeURIComponent(data.chapter.hash)+"/"+encodeURIComponent(data.chapter.data[page]));
  }
  return Response.json({error:"无效请求"},{status:400});
 } catch(error){return Response.json({error:error instanceof Error?error.message:"漫画来源暂不可用"},{status:502});}
}
async function imageResponse(url:string,signal?:AbortSignal){
 const response=await upstreamFetch(url,{headers:ua,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15_000)]):AbortSignal.timeout(15_000),redirect:"manual"});
 if(!response.ok){await response.body?.cancel();return Response.json({error:"图片暂不可用 ("+response.status+")"},{status:[401,402,403,429].includes(response.status)?response.status:502});}
 const type=(response.headers.get("content-type")||"").split(";")[0].toLowerCase();
 if(!/^image\/(?:jpeg|png|webp|gif)$/.test(type)||Number(response.headers.get("content-length"))>16_000_000){await response.body?.cancel();return Response.json({error:"未收到有效图片"},{status:502});}
 const reader=response.body?.getReader();if(!reader)return Response.json({error:"未收到有效图片"},{status:502});
 const chunks:Uint8Array[]= [];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16_000_000){await reader.cancel();return Response.json({error:"图片过大"},{status:502});}chunks.push(part.value);}}finally{reader.releaseLock();}
 const data=Buffer.concat(chunks),signature=data[0]===255&&data[1]===216?"image/jpeg":data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?"image/png":data.subarray(0,4).toString()==="RIFF"&&data.subarray(8,12).toString()==="WEBP"?"image/webp":/^GIF8[79]a$/.test(data.subarray(0,6).toString())?"image/gif":"";
 if(signature!==type)return Response.json({error:"未收到有效图片"},{status:502});
 return new Response(data,{headers:{"Content-Type":type,"Cache-Control":"public,max-age=1800","X-Content-Type-Options":"nosniff"}});
}
