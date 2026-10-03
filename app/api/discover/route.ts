import { discover } from '@/lib/discover';
export async function GET(){return Response.json(await discover(),{headers:{'Cache-Control':'private, max-age=300'}});}
