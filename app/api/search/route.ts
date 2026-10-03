import { mangaSearch, manhuaguiSearch, mergeWorks, videoSearch } from "@/lib/media";
import {siteSearch} from "@/lib/site-sources";
import {improveArtwork} from "@/lib/discover";
import {comicSearch} from "@/lib/comic-sources";
export async function GET(request:Request) {
 const url=new URL(request.url),q=(url.searchParams.get("q")||"").trim().slice(0,120),kind=url.searchParams.get("kind")||"all",browse=!q,page=Math.max(1,Math.min(10,Number(url.searchParams.get("page"))||1));
 if(!["all","movie","tv","anime","manga"].includes(kind))return Response.json({error:"无效栏目"},{status:400});
 const video=kind==="manga"?Promise.resolve({works:[],statuses:[]}):videoSearch(q,kind,browse,page);
 const comic=kind==="manga" || (kind==="all"&&!browse)?mangaSearch(q,browse,page):Promise.resolve([]);
 const man=kind==="manga"||kind==="all"&&!browse?manhuaguiSearch(q,page):Promise.resolve([]);
 const sites=kind==="manga"?Promise.resolve({works:[],statuses:[]}):siteSearch(q,kind,page);
 const comics=kind==="manga"||(kind==="all"&&!browse)?comicSearch(q,page):Promise.resolve({works:[],statuses:[]});
 const [v,m,h,s,c]=await Promise.allSettled([video,comic,man,sites,comics]);
 const result=v.status==="fulfilled"?v.value:{works:[],statuses:[]};
 return Response.json({works:improveArtwork(mergeWorks([...result.works,...(s.status==="fulfilled"?s.value.works:[]),...(m.status==="fulfilled"?m.value:[]),...(h.status==="fulfilled"?h.value:[]),...(c.status==="fulfilled"?c.value.works:[])])),statuses:[...result.statuses,...(c.status==="fulfilled"?c.value.statuses:[]),...(s.status==="fulfilled"?s.value.statuses:[]),...(kind==="manga"||(kind==="all"&&!browse)?[{id:"mangadex",name:"MangaDex",state:m.status==="fulfilled"?"ok":"error",count:m.status==="fulfilled"?m.value.length:0,ms:0,message:m.status==="rejected"?"漫画来源暂不可用":undefined},...(!browse?[{id:"manhuagui",name:"漫画柜",state:h.status==="fulfilled"?"ok":"error",count:h.status==="fulfilled"?h.value.length:0,ms:0,message:h.status==="rejected"?"漫画柜暂不可用":undefined}]:[])]:[])],page,browse},{headers:{"Cache-Control":"private, max-age=60"}});
}
