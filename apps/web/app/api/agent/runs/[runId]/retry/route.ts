import {after,NextRequest,NextResponse} from 'next/server';
import {getRun,startAgentRun} from '@zamp/agent';
import {dispatchAgentWorker} from '../../../../../../lib/agent-worker';
import {allowed,denied,failed,invalid,validId} from '../../../../../../lib/agent-api';
export const runtime='nodejs';export const maxDuration=150;
export async function POST(request:NextRequest,{params}:{params:Promise<{runId:string}>}){if(!allowed(request,true))return denied();const {runId}=await params;if(!validId(runId))return invalid();try{const previous=await getRun(runId);if(!['FAILED','CANCELLED'].includes(previous.status))return NextResponse.json({error:'Only failed or cancelled runs can be retried'},{status:409});const newRunId=await startAgentRun(previous.invoice_id);after(async()=>{await dispatchAgentWorker(request.nextUrl.origin)});return NextResponse.json({runId:newRunId,status:'QUEUED'},{status:202})}catch(error){return failed(error)}}
