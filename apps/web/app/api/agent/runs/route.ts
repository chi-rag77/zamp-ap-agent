import {after,NextRequest,NextResponse} from 'next/server';
import {runAgent,startAgentRun} from '@zamp/agent';
import {allowed,denied,failed,validId} from '../../../../lib/agent-api';
export const runtime='nodejs';export const maxDuration=150;
export async function POST(request:NextRequest){if(!allowed(request,true))return denied();try{const body=await request.json();if(!validId(body?.invoiceId))return NextResponse.json({error:'Invalid invoice ID'},{status:400});if(body.mode==='SIMULATION'){const result=await runAgent(body.invoiceId,{mode:'SIMULATION'});return NextResponse.json(result)}if(body.mode&&body.mode!=='LIVE')return NextResponse.json({error:'Invalid mode'},{status:400});const runId=await startAgentRun(body.invoiceId);after(async()=>{try{await runAgent(body.invoiceId,{runId})}catch(error){console.error('Agent background run failed',error)}});return NextResponse.json({runId,status:'QUEUED'},{status:202})}catch(error){return failed(error)}}
