import {after,NextRequest,NextResponse} from 'next/server';
import {syncGmailMailbox} from '@zamp/email';
import {emailAdmin} from '../../../../lib/email-api';
import {dispatchAgentWorker} from '../../../../lib/agent-worker';
import {dispatchEmailSyncContinuation} from '../../../../lib/email-sync-dispatch';
import {createServerClient} from '@zamp/database';
export const runtime='nodejs';export const maxDuration=300;
export async function POST(request:NextRequest){if(!emailAdmin(request))return NextResponse.json({error:'Unauthorized'},{status:401});try{const payload=await request.json().catch(()=>({})) as {jobId?:string};const jobId=typeof payload.jobId==='string'?payload.jobId:undefined;const result=await syncGmailMailbox();after(async()=>{if(result.hasMore){if(jobId)await createServerClient().from('email_sync_jobs').update({status:'RUNNING'}).eq('id',jobId);await dispatchEmailSyncContinuation(request.nextUrl.origin,jobId)}else{if(jobId)await createServerClient().from('email_sync_jobs').update({status:'COMPLETED',completed_at:new Date().toISOString(),last_error:null}).eq('id',jobId);await dispatchAgentWorker(request.nextUrl.origin)}});return NextResponse.json(result)}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Sync failed'},{status:502})}}
