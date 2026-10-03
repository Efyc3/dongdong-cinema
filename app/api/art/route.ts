import {upstreamFetch as fetch} from "@/lib/upstream-fetch";
const hosts=/^img\d+\.doubanio\.com$/;
export async function GET(request:Request){
 const value=new URL(request.url).searchParams.get("url")||"";let url:URL;
 try{url=new URL(value);if(url.protocol!=="https:"||!hosts.test(url.hostname)||!/^\/view\/photo\/[a-z_]+\/public\/p\d+\.(jpg|png|webp)$/.test(url.pathname)||url.search||url.username||url.password)throw new Error();}catch{return new Response("Invalid image",{status:400});}
 try{
  let r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0","Referer":"https://movie.douban.com/"},signal:AbortSignal.timeout(8000),redirect:"error"});
  if(!r.ok&&url.pathname.includes("/raw/")){url.pathname=url.pathname.replace("/raw/","/l/");r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0","Referer":"https://movie.douban.com/"},signal:AbortSignal.timeout(5000),redirect:"error"});}
  const type=r.headers.get("content-type")||"";if(!r.ok||!type.startsWith("image/"))return new Response("Unavailable",{status:502});const bytes=await r.arrayBuffer();if(bytes.byteLength>12_000_000)return new Response("Too large",{status:413});
  return new Response(bytes,{headers:{"Content-Type":type,"Cache-Control":"public, max-age=86400","X-Content-Type-Options":"nosniff"}});
 }catch{return new Response("Unavailable",{status:502});}
}

