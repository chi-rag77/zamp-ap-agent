import {after,NextRequest,NextResponse} from 'next/server';
import {processNextAgentJob} from '@zamp/agent';
import {dispatchAgentWorker} from '../../../../lib/agent-worker';
import {isAgentWorkerAuthorized} from '../../../../lib/agent-worker-auth';
import {createServerClient} from '@zamp/database';
import {sendApprovalEmailLinks} from '../../../../lib/approval-email';
export const runtime='nodejs';export const maxDuration=120;
async function work(request:NextRequest){if(!isAgentWorkerAuthorized(request.headers.get('authorization')))return NextResponse.json({error:'Unauthorized'},{status:401});try{const result=await processNextAgentJob();if(result.claimed&&result.status==='WAITING'&&result.step==='EVALUATE_POLICY'&&result.runId){try{const db=createServerClient();const run=await db.from('agent_runs').select('organization_id,invoice_id').eq('id',result.runId).maybeSingle();if(run.data?.organization_id&&run.data.invoice_id){const pending=await db.from('approval_requests').select('id').eq('organization_id',run.data.organization_id).eq('invoice_id',run.data.invoice_id).eq('status','PENDING').order('requested_at',{ascending:false}).limit(1).maybeSingle();if(pending.data)await sendApprovalEmailLinks(db,run.data.organization_id,pending.data.id)}}catch(error){console.warn('Approval email notification could not be sent',{status:'delivery',message:error instanceof Error?error.message:'unknown'})}}if(result.claimed)after(async()=>{await dispatchAgentWorker(request.nextUrl.origin);if('retryable' in result&&result.retryable&&result.retryAfterSeconds){await new Promise(resolve=>setTimeout(resolve,result.retryAfterSeconds!*1000));await dispatchAgentWorker(request.nextUrl.origin)}});return NextResponse.json(result,{status:200})}catch(error){console.error('Agent worker failed',error);return NextResponse.json({error:error instanceof Error?error.message:'Worker failed'},{status:500})}}
export const POST=work;
export const GET=work;
