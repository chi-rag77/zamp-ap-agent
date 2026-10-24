import {NextRequest,NextResponse} from 'next/server';
import {getAgentHealth} from '../../../../lib/agent-health';
import {allowed} from '../../../../lib/agent-api';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:NextRequest){
  if(!allowed(request))return NextResponse.json({error:'Unavailable outside the local workspace'},{status:403});
  const health=await getAgentHealth();
  return NextResponse.json(health,{status:health.status==='ONLINE'?200:503,headers:{'Cache-Control':'no-store'}});
}
