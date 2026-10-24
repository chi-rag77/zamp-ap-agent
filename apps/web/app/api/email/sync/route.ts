import {after,NextRequest,NextResponse} from 'next/server';
import {syncGmailMailbox} from '@zamp/email';
import {emailAdmin} from '../../../../lib/email-api';
import {dispatchAgentWorker} from '../../../../lib/agent-worker';
export const runtime='nodejs';export const maxDuration=300;
export async function POST(request:NextRequest){if(!emailAdmin(request))return NextResponse.json({error:'Unauthorized'},{status:401});try{const result=await syncGmailMailbox();after(async()=>{await dispatchAgentWorker(request.nextUrl.origin)});return NextResponse.json(result)}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Sync failed'},{status:502})}}
