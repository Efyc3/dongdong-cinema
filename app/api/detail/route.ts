import { videoDetail } from "@/lib/media";
import {siteDetail} from "@/lib/site-sources";
import {siteProviders} from "@/lib/site-provider-info";
export async function GET(request:Request){
 const url=new URL(request.url);
 const provider=url.searchParams.get("provider")||"",id=url.searchParams.get("id")||"";
 try{return Response.json(await (siteProviders.some(p=>p.id===provider)?siteDetail(provider,id):videoDetail(provider,id)));}
 catch(error){return Response.json({error:error instanceof Error?error.message:"来源暂不可用"},{status:502});}
}
