import {sourceQuality} from "@/lib/stream-quality";
export async function GET(request:Request){const p=new URL(request.url).searchParams;try{return Response.json({qualityMax:await sourceQuality(p.get("provider")||"",p.get("id")||"")},{headers:{"Cache-Control":"private, max-age=300"}});}catch{return Response.json({qualityMax:0});}}
