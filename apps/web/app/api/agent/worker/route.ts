import {after,NextRequest,NextResponse} from 'next/server';
import {processNextAgentJob} from '@zamp/agent';
import {dispatchAgentWorker} from '../../../../lib/agent-worker';
import {isAgentWorkerAuthorized} from '../../../../lib/agent-worker-auth';
export const runtime='nodejs';export const maxDuration=120;
async function work(request:NextRequest){if(!isAgentWorkerAuthorized(request.headers.get('authorization')))return NextResponse.json({error:'Unauthorized'},{status:401});try{const result=await processNextAgentJob();if(result.claimed)after(async()=>{await dispatchAgentWorker(request.nextUrl.origin);if('retryable' in result&&result.retryable&&result.retryAfterSeconds){await new Promise(resolve=>setTimeout(resolve,result.retryAfterSeconds!*1000));await dispatchAgentWorker(request.nextUrl.origin)}});return NextResponse.json(result,{status:200})}catch(error){console.error('Agent worker failed',error);return NextResponse.json({error:error instanceof Error?error.message:'Worker failed'},{status:500})}}
export const POST=work;
export const GET=work;
