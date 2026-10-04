import {anime1Stream} from "@/lib/anime1";

export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{token:string}>};
export async function GET(request:Request,context:Context){return anime1Stream((await context.params).token,request);}
export async function HEAD(request:Request,context:Context){return anime1Stream((await context.params).token,request);}
