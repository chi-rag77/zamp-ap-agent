import {timingSafeEqual} from 'node:crypto';
import {after,NextRequest,NextResponse} from 'next/server';
import {processNextAgentJob} from '@zamp/agent';
import {dispatchAgentWorker} from '../../../../lib/agent-worker';
export const runtime='nodejs';export const maxDuration=120;
function authorized(request:NextRequest){const expected=process.env.AGENT_WORKER_SECRET??process.env.CRON_SECRET;const supplied=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');if(!expected||!supplied)return false;const a=Buffer.from(expected),b=Buffer.from(supplied);return a.length===b.length&&timingSafeEqual(a,b)}
async function work(request:NextRequest){if(!authorized(request))return NextResponse.json({error:'Unauthorized'},{status:401});try{const result=await processNextAgentJob();if(result.claimed)after(async()=>{await dispatchAgentWorker(request.nextUrl.origin);if('retryable' in result&&result.retryable&&result.retryAfterSeconds){await new Promise(resolve=>setTimeout(resolve,result.retryAfterSeconds!*1000));await dispatchAgentWorker(request.nextUrl.origin)}});return NextResponse.json(result,{status:200})}catch(error){console.error('Agent worker failed',error);return NextResponse.json({error:error instanceof Error?error.message:'Worker failed'},{status:500})}}
export const POST=work;
export const GET=work;
