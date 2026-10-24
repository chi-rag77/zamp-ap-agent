import {after,NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {syncGmailMailbox} from '@zamp/email';
import {dispatchAgentWorker} from '../../../../lib/agent-worker';

export const runtime='nodejs';
export const maxDuration=300;

function authorized(request:NextRequest){
 const expected=process.env.EMAIL_CRON_TOKEN;
 const supplied=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 if(!expected||!supplied)return false;
 const a=Buffer.from(expected),b=Buffer.from(supplied);
 return a.length===b.length&&timingSafeEqual(a,b);
}

export async function POST(request:NextRequest){
 if(!authorized(request))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  const result=await syncGmailMailbox();
  if(!result.hasMore)after(async()=>{await dispatchAgentWorker(request.nextUrl.origin)});
  return NextResponse.json(result);
 }catch(error){
  console.error('Scheduled Gmail sync failed',error);
  return NextResponse.json({error:error instanceof Error?error.message:'Gmail sync failed'},{status:502});
 }
}
